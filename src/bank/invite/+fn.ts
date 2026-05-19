import { ROLES } from "@lib/common/roles.ts";
import INVITE_EMAIL_TEMPLATE from "@lib/server/emails/invite.html" with {
  type: "text"
};
import {
  ApiError,
  createSuccessResponse,
  forwardErrors,
} from "@lib/server/error.ts";
import { template } from "@lib/server/template.ts";
import { createToken, storeValidToken } from "@lib/server/token.ts";
import { BankData } from "../+types.ts";

const EMAIL_VALIDATION_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const INVITE_TOKEN_TTL = "7d";
const INVITE_TOKEN_TTL_LABEL = "7 days";

const ACCESS_PLATFORM_BIT = Number(
  Object.entries(ROLES).find(([, name]) => name === "access_platform")![0],
);

/** Map role names → bit indices, derived once from the metadata. */
const ROLE_NAME_TO_BIT = Object.fromEntries(
  Object.entries(ROLES).map(([bit, name]) => [name, Number(bit)]),
) as Record<string, number>;

const requireString = (
  value: FormDataEntryValue | null,
  field: string,
  maxLen = 200,
): string => {
  if (typeof value !== "string") {
    throw new ApiError(`Missing field: ${field}`, 400, "invite_invalid_input");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApiError(`Missing field: ${field}`, 400, "invite_invalid_input");
  }
  if (trimmed.length > maxLen) {
    throw new ApiError(
      `Field too long: ${field}`,
      400,
      "invite_invalid_input",
    );
  }
  return trimmed;
};

export const onRequestPost = forwardErrors<Env, string, BankData>(
  async (ctx) => {
    const inviterRoles = ctx.data.token.roles;
    // Bit-check inline so we don't import `hasRole` just to recheck one bit
    const inviteBit = Number(
      Object.entries(ROLES).find(([, n]) => n === "invite_user")![0],
    );
    if ((inviterRoles & (1 << inviteBit)) === 0) {
      throw new ApiError(
        "Insufficient permissions to invite users",
        403,
        "insufficient_permissions",
      );
    }

    const body = await ctx.request.formData();
    const first_name = requireString(body.get("first_name"), "first_name", 80);
    const last_name = requireString(body.get("last_name"), "last_name", 80);
    const emailRaw = requireString(body.get("email"), "email", 200);
    const email = emailRaw.toLowerCase();
    if (!EMAIL_VALIDATION_REGEX.test(email)) {
      throw new ApiError("Invalid email", 400, "invite_invalid_input");
    }

    // Build the requested role bitmask from form, intersected with inviter's
    // own roles so nobody can hand out permissions they don't hold themselves.
    let requestedRoles = 0;
    for (const [name, bit] of Object.entries(ROLE_NAME_TO_BIT)) {
      if (body.get(`role_${name}`) === "on") requestedRoles |= 1 << bit;
    }
    // Invitee must always be able to access the platform
    requestedRoles |= 1 << ACCESS_PLATFORM_BIT;
    const grantableRoles = requestedRoles & inviterRoles;

    if (grantableRoles !== requestedRoles) {
      throw new ApiError(
        "Cannot grant roles you do not hold yourself",
        403,
        "invite_unauthorised_roles",
      );
    }

    const existing = await ctx.env.DB.prepare(
      "SELECT id FROM users WHERE email = ?",
    ).bind(email).first<{ id: number }>();
    if (existing) {
      throw new ApiError(
        "A user with that email already exists",
        409,
        "invite_email_taken",
      );
    }

    const inviterUserId = ctx.data.token.userId;
    const created = await ctx.env.DB.prepare(
      `INSERT INTO users (created_at, email, first_name, last_name, roles, referrer)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
    ).bind(
      Date.now(),
      email,
      first_name,
      last_name,
      grantableRoles,
      inviterUserId,
    ).first<{ id: number }>();

    if (!created) {
      throw new ApiError(
        "Failed to create user",
        500,
        "invite_failed",
      );
    }

    // Mint a magic-link token the invitee can use to set up their session
    const jwt = await createToken(ctx.env.APP_SECRET, INVITE_TOKEN_TTL, {
      email,
      userId: created.id,
      roles: grantableRoles,
    });
    const tokenStoreError = await storeValidToken(
      jwt,
      ctx.env.APP_SECRET,
      ctx.env.KV,
    );
    if (tokenStoreError) {
      throw new ApiError(
        "Failed to store invite token",
        500,
        "invite_failed",
      );
    }

    const inviterName = body.get("inviter_display_name");
    const inviterLabel =
      typeof inviterName === "string" && inviterName.trim().length > 0
        ? inviterName.trim()
        : ctx.data.token.email;

    const url = new URL(ctx.request.url);
    const html = template(INVITE_EMAIL_TEMPLATE, {
      INVITER_NAME: inviterLabel,
      EXPIRY_TIME: INVITE_TOKEN_TTL_LABEL,
      TOKEN_URL: `${url.origin}/bank/login/token?t=${jwt}`,
      RECIPIENT_EMAIL: email,
      YEAR: new Date().getFullYear(),
    });

    if (
      "SKIP_AUTH_EMAIL" in ctx.env &&
      ctx.env.SKIP_AUTH_EMAIL === "TRUE"
    ) {
      // Local-dev shortcut consistent with /bank/login
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    const sendResult = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + ctx.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Mannr <no-reply@mannr.org>",
        to: email,
        subject: `${inviterLabel} invited you to Mannr`,
        html,
      }),
    });

    if (!sendResult.ok) {
      console.error("Resend send error", await sendResult.text());
      throw new ApiError(
        "We couldn't send the invite email. Please try again.",
        500,
        "invite_failed",
      );
    }

    // PRG: form submissions get redirected; JSON callers get the row back
    return createSuccessResponse(
      ctx.request,
      { userId: created.id, email, first_name, last_name },
      "invite_sent",
    );
  },
);
