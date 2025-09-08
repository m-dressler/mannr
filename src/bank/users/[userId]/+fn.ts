import { toGravatarUrl } from "@lib/common/gravatar.ts";
import { hasRole } from "@lib/common/roles.ts";
import {
  ApiError,
  createSuccessResponse,
  forwardErrors,
} from "@lib/server/error.ts";
import { getLocale } from "@lib/server/locale.ts";
import { template } from "@lib/server/template.ts";
import { toUiUser } from "@lib/server/user.ts";
import { BankData } from "../../+types.ts";
import BANK_METADATA_RAW from "../../meta.json" with { type: "json" };

const BANK_METADATA = BANK_METADATA_RAW as unknown as BankMetadata;

/** Calculate required vouches based on transaction delta */
const calculateRequiredVouches = (delta: number): number => {
  const absDelta = Math.abs(delta);
  let vouches = 0;
  for (const threshold of BANK_METADATA.vouchThresholds) {
    if (absDelta >= threshold.minAbsDelta) {
      vouches = Math.max(vouches, threshold.requiredVouches);
    }
  }
  return vouches;
};

const isValidUserId = (userId: string | string[]): userId is string =>
  typeof userId === "string" && /^[0-9]+$/.test(userId);

const getUser = async (
  db: D1Database,
  userId: string,
): Promise<User | Error> => {
  const userRaw = await db.prepare("SELECT * FROM users WHERE id == ?")
    .bind(Number(userId))
    .first<User>();

  if (userRaw) return userRaw;
  else return new Error(`User with ID ${userId} not found`);
};

export const onRequestGet: PagesFunction<Env, "userId", BankData> = async ({
  env,
  params,
  request,
  next,
}) => {
  if (!isValidUserId(params.userId)) return next();

  const userRaw = await getUser(env.DB, params.userId);
  if (userRaw instanceof Error) {
    return Response.json({ message: userRaw.message }, { status: 404 });
  }

  const user = toUiUser(userRaw);

  const htmlResponse = await env.ASSETS.fetch(
    "/bank/users/[userId]/index.html",
  );
  const html = template(await htmlResponse.text(), {
    NAME: user.first_name,
    TOKENS: new Intl.NumberFormat(getLocale(request)).format(
      user.mps,
    ),
    AVATAR_SRC: toGravatarUrl(user.gravatarId),
    AVATAR_ALT: user.first_name + ` profile picture`,
    GRAVATAR_ID: user.gravatarId,
  });

  return new Response(html, htmlResponse);
};

export const onRequestPost = forwardErrors<Env, "userId", BankData>(async (
  ctx,
) => {
  if (!isValidUserId(ctx.params.userId)) return ctx.next();

  const recipientUser = await getUser(ctx.env.DB, ctx.params.userId);
  if (recipientUser instanceof Error) {
    throw new ApiError(recipientUser.message, 404, "user_not_found");
  }

  const body = await ctx.request.formData();
  const reason = body.get("reason");
  if (!reason || typeof reason !== "string") {
    throw new ApiError(
      "Invalid request body: Property `reason` is missing or invalid.",
      400,
      "invalid_reason",
    );
  }

  // Check for transfer vs mint mode
  const mode = body.get("mode");
  const isTransfer = mode === "transfer";

  // Determine delta and reason
  let delta: number;
  let finalReason: string;

  if (reason.startsWith("id:")) {
    // Standard transaction (from meta.json)
    const reasonId = reason.substring(3);
    const { standardTransactions } = BANK_METADATA;
    const transaction = standardTransactions[reasonId];
    if (!transaction) {
      throw new ApiError(
        `Invalid request body: Property "reason" references unknown standard transaction id: ${reasonId}`,
        400,
        "invalid_reason",
      );
    }
    delta = transaction[1];
    finalReason = reason;
  } else {
    // Custom delta from form
    const deltaStr = body.get("delta");
    if (!deltaStr || typeof deltaStr !== "string") {
      throw new ApiError(
        "Custom transactions require a delta value",
        400,
        "invalid_delta",
      );
    }

    delta = parseInt(deltaStr, 10);
    if (body.has("negative")) delta = -delta;
    if (isNaN(delta)) {
      throw new ApiError(
        "Invalid delta value",
        400,
        "invalid_delta",
      );
    }

    finalReason = reason;
  }

  // Determine transaction type and handle transfer logic
  let transactionType: "mint" | "transfer";
  let senderUserId: number | null = null;
  let actualRecipientId: number;
  let actualDelta: number;

  if (isTransfer) {
    // Transfer mode - requires transfer_mt role
    if (!hasRole(ctx.data.token.roles, "transfer_mt")) {
      throw new ApiError(
        "Insufficient permissions to transfer tokens",
        403,
        "insufficient_permissions",
      );
    }

    transactionType = "transfer";
    senderUserId = ctx.data.token.userId;

    // Handle negative deltas (recipient sends to sender)
    if (delta < 0) {
      actualRecipientId = senderUserId;
      actualDelta = -delta;
      senderUserId = recipientUser.id;
    } else {
      actualRecipientId = recipientUser.id;
      actualDelta = delta;
    }

    // Validate sender has sufficient available balance
    const senderUser = await getUser(ctx.env.DB, senderUserId.toString());
    if (senderUser instanceof Error) {
      throw new ApiError(senderUser.message, 404, "user_not_found");
    }

    const availableBalance = senderUser.mps - senderUser.reserved_mps;
    if (availableBalance < actualDelta) {
      throw new ApiError(
        `Insufficient balance. Available: ${availableBalance} MT, Required: ${actualDelta} MT`,
        400,
        "insufficient_balance",
      );
    }

    // Reserve funds immediately
    await ctx.env.DB.prepare(
      "UPDATE users SET reserved_mps = reserved_mps + ? WHERE id = ?",
    ).bind(actualDelta, senderUserId).run();
  } else {
    // Mint mode - creates new MPs
    transactionType = "mint";
    actualRecipientId = recipientUser.id;
    actualDelta = delta;
  }

  // Only mints require vouches, transfers are instant
  const requiredVouches = transactionType === "mint"
    ? calculateRequiredVouches(actualDelta)
    : 0;
  const createdByUserId = ctx.data.token.userId;

  // Create transaction record
  const insertResult = await ctx.env.DB.prepare(
    `INSERT INTO transactions (
      recipient_user_id, delta, reason, transaction_type, sender_user_id,
      created_by_user_id, status, required_vouches
    ) VALUES (?, ?, ?, ?, ?, ?, '${
      requiredVouches > 0 ? "pending" : "active"
    }', ?)`,
  ).bind(
    actualRecipientId,
    actualDelta,
    finalReason,
    transactionType,
    senderUserId,
    createdByUserId,
    requiredVouches,
  ).run();

  if (insertResult.error) {
    // Rollback reserved funds if transaction creation failed
    if (isTransfer && senderUserId !== null) {
      await ctx.env.DB.prepare(
        "UPDATE users SET reserved_mps = reserved_mps - ? WHERE id = ?",
      ).bind(actualDelta, senderUserId).run();
    }
    throw new ApiError(insertResult.error, 500, "transaction_failed");
  }

  // Directly apply transaction if no vouches are required
  if (requiredVouches === 0) {
    if (transactionType === "transfer" && senderUserId !== null) {
      // For transfers: deduct from sender, add to recipient, unreserve
      const senderUpdate = await ctx.env.DB.prepare(
        "UPDATE users SET mps = mps - ?, reserved_mps = reserved_mps - ? WHERE id = ?",
      ).bind(actualDelta, actualDelta, senderUserId).run();

      if (senderUpdate.error) {
        throw new ApiError(
          senderUpdate.error,
          500,
          "transaction_failed",
        );
      }

      const recipientUpdate = await ctx.env.DB.prepare(
        "UPDATE users SET mps = mps + ? WHERE id = ?",
      ).bind(actualDelta, actualRecipientId).run();

      if (recipientUpdate.error) {
        throw new ApiError(
          recipientUpdate.error,
          500,
          "transaction_failed",
        );
      }
    } else {
      // For mints: only add to recipient
      const updateResult = await ctx.env.DB.prepare(
        "UPDATE users SET mps = mps + ? WHERE id = ?",
      ).bind(actualDelta, actualRecipientId).run();

      if (updateResult.error) {
        throw new ApiError(
          updateResult.error,
          500,
          "transaction_failed",
        );
      }
    }
  }

  return createSuccessResponse(ctx.request, undefined, "transaction_created");
});
