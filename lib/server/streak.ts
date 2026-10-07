import {
  advanceStreak,
  getStreakReward,
  type Streak,
} from "@lib/common/streak.ts";

/** The id of the Bank user that mints streak rewards */
const BANK_USER_ID = 0;

/** A parameterized SQL statement, kept as data so tests can run it on plain SQLite */
export type Statement = { sql: string; params: Array<string | number | null> };

/**
 * The writes that move `userId`'s streak from `prev` to `next` and mint `mps`
 * if non-zero, meant to run as one D1 batch, i.e. one transaction.
 *
 * The streak update is a compare-and-swap on `streak_at`, and the payout
 * statements only apply if it changed the row. So of the burst of parallel
 * requests a page load fires, exactly one pays out, and a failed payout rolls
 * the streak back for the next request to retry.
 *
 * Streak mints are Bank mints and skip the vouch policy on purpose.
 */
export const toStreakStatements = (
  userId: number,
  prev: Streak,
  next: Streak,
  mps: number,
): Statement[] => {
  const advance: Statement = {
    sql: `UPDATE users SET streak_days = ?, streak_at = ?
           WHERE id = ? AND streak_at IS ?`,
    params: [next.days, next.at, userId, prev.at],
  };
  if (mps === 0) return [advance];

  // `changes()` is the row count of the previous statement in the batch
  return [
    advance,
    {
      sql: `INSERT INTO transactions (
              recipient_user_id, delta, reason, transaction_type,
              created_by_user_id, status, required_vouches
            ) SELECT ?, ?, ?, 'mint', ?, 'active', 0 WHERE changes() = 1`,
      params: [userId, mps, `${next.days}-Day Login Streak`, BANK_USER_ID],
    },
    {
      sql: "UPDATE users SET mps = mps + ? WHERE id = ? AND changes() = 1",
      params: [mps, userId],
    },
  ];
};

/**
 * Counts a visit at `now` (epoch ms) towards the user's streak and mints the
 * reward if the streak hits a payout day. Returns the MPs paid, 0 if none.
 */
export const recordStreakVisit = async (
  DB: D1Database,
  userId: number,
  streak: Streak,
  now: number,
): Promise<number> => {
  const next = advanceStreak(streak, now);
  if (!next) return 0;

  const mps = getStreakReward(next.days);
  const [advance, ...payout] = toStreakStatements(userId, streak, next, mps)
    .map(({ sql, params }) => DB.prepare(sql).bind(...params));
  if (payout.length === 0) {
    await advance.run();
    return 0;
  }

  const results = await DB.batch([advance, ...payout]);
  return results[results.length - 1].meta.changes === 1 ? mps : 0;
};
