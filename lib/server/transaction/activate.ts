import type { Statement } from "../streak.ts";

/**
 * The writes that activate a pending transaction and apply its MPs, meant to
 * run as one D1 batch, i.e. one transaction.
 *
 * The status flip is a compare-and-swap on `status = 'pending'`, and every
 * balance update only applies if the statement before it changed a row. So
 * of concurrent activations, or an activation racing a revocation, at most
 * one applies the MPs. The first result's `meta.changes` is 1 only for it.
 */
export const toActivationStatements = (transaction: {
  id: number;
  transaction_type: "mint" | "transfer";
  delta: number;
  recipient_user_id: number;
  sender_user_id: number | null;
}): Statement[] => {
  const activate: Statement = {
    sql: "UPDATE transactions SET status = 'active' WHERE id = ? AND status = 'pending'",
    params: [transaction.id],
  };
  // `changes()` is the row count of the previous statement in the batch
  const credit: Statement = {
    sql: "UPDATE users SET mps = mps + ? WHERE id = ? AND changes() = 1",
    params: [transaction.delta, transaction.recipient_user_id],
  };
  if (
    transaction.transaction_type !== "transfer" ||
    transaction.sender_user_id === null
  ) return [activate, credit];

  // For transfers: deduct from sender, unreserve, then add to recipient
  const debit: Statement = {
    sql: `UPDATE users SET mps = mps - ?, reserved_mps = reserved_mps - ?
           WHERE id = ? AND changes() = 1`,
    params: [transaction.delta, transaction.delta, transaction.sender_user_id],
  };
  return [activate, debit, credit];
};
