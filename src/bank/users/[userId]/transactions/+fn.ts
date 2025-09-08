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

  // Check if this is an API request for transactions
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const { results: transactions } = await env.DB.prepare(
    `SELECT t.*, COUNT(tv.id) as vouch_count
       FROM transactions t
       LEFT JOIN transaction_vouches tv ON t.id = tv.transaction_id
       WHERE t.recipient_user_id = ?
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
  ).bind(userRaw.id, limit, offset).all<
    Transaction & { vouch_count: number }
  >();

  // Collect all relevant user IDs (creators and senders)
  const userIds = new Set(transactions.map((t) => t.created_by_user_id));

  // Fetch user names
  const users = await env.DB.prepare(
    `SELECT id, first_name, last_name FROM users
     WHERE id IN (${Array(userIds.size).fill("?").join(",")})`,
  ).bind(...[...userIds]).all<
    { id: number; first_name: string; last_name: string }
  >();

  const userNames = new Map(
    users.results.map((u) => [u.id, `${u.first_name} ${u.last_name}`]),
  );

  // Enrich transactions with user names and direction
  const enrichedTransactions = transactions.map((t) => ({
    ...t,
    creator_name: userNames.get(t.created_by_user_id) || "Unknown",
    sender_name: t.sender_user_id !== null ? userNames.get(t.sender_user_id) : null,
    recipient_name: userNames.get(t.recipient_user_id) || "Unknown",
    direction: t.sender_user_id === userRaw.id ? "outgoing" : "incoming",
  }));

  return Response.json(enrichedTransactions);
};
