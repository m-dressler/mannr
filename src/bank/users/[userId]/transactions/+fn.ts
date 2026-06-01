import { BankData } from "../../../+types.ts";

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

  // Include transactions where user is recipient OR outgoing-transfer sender
  const { results: transactions } = await env.DB.prepare(
    `SELECT t.*, COUNT(tv.id) as vouch_count
       FROM transactions t
       LEFT JOIN transaction_vouches tv ON t.id = tv.transaction_id
       WHERE t.recipient_user_id = ?
          OR (t.sender_user_id = ? AND t.transaction_type = 'transfer')
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
  ).bind(userRaw.id, userRaw.id, limit, offset).all<
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
    direction: t.sender_user_id === userRaw.id ? "outgoing" : "incoming",
  }));

  return Response.json(enrichedTransactions);
};
