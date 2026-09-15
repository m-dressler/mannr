import {
  getTransactionDirection,
  parseTransactionDirection,
  type TransactionDirection,
} from "@lib/common/transactionDirection.ts";
import { BankData } from "../../../+types.ts";

/**
 * SQL condition selecting a user's transactions for each direction. Each binds
 * the user id exactly once. Must agree with {@link getTransactionDirection}.
 */
const DIRECTION_CONDITIONS: Record<TransactionDirection, string> = {
  incoming: "t.recipient_user_id = ?",
  outgoing: "t.sender_user_id = ? AND t.transaction_type = 'transfer'",
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

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const direction = parseTransactionDirection(
    url.searchParams.get("direction"),
  );

  const { results: transactions } = await env.DB.prepare(
    `SELECT t.*, COUNT(tv.id) as vouch_count
       FROM transactions t
       LEFT JOIN transaction_vouches tv ON t.id = tv.transaction_id
       WHERE ${DIRECTION_CONDITIONS[direction]}
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
  ).bind(userRaw.id, limit, offset).all<
    Transaction & { vouch_count: number }
  >();

  // Collect every user id we need to resolve a display name for
  const userIds = new Set<number>();
  for (const t of transactions) {
    userIds.add(t.created_by_user_id);
    if (t.sender_user_id !== null) userIds.add(t.sender_user_id);
    userIds.add(t.recipient_user_id);
  }

  const userNames = new Map<number, string>();
  if (userIds.size > 0) {
    const placeholders = Array(userIds.size).fill("?").join(",");
    const users = await env.DB.prepare(
      `SELECT id, first_name, last_name FROM users WHERE id IN (${placeholders})`,
    ).bind(...userIds).all<
      { id: number; first_name: string; last_name: string }
    >();
    for (const u of users.results) {
      userNames.set(u.id, `${u.first_name} ${u.last_name}`);
    }
  }

  const enrichedTransactions = transactions.map((t) => ({
    ...t,
    creator_name: userNames.get(t.created_by_user_id) || "Unknown",
    sender_name: t.sender_user_id !== null
      ? userNames.get(t.sender_user_id) ?? null
      : null,
    recipient_name: userNames.get(t.recipient_user_id) || "Unknown",
    direction: getTransactionDirection(t, userRaw.id),
  }));

  return Response.json(enrichedTransactions);
};
