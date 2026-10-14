import type { Statement } from "../streak.ts";

/**
 * The writes that revoke `transaction` and undo whatever its `status` (as the
 * caller read it) implies, meant to run as one D1 batch, i.e. one transaction:
 * an active one has its MPs reversed, a pending transfer is unreserved.
 *
 * The revocation is a compare-and-swap on that read `status`, and every
 * balance update only applies if the statement before it changed a row. So if
 * the transaction was revoked or activated in the meantime, nothing changes —
 * the first result's `meta.changes` is 0 and the caller should report a
 * conflict rather than reverse a state it didn't see.
 */
export const toRevocationStatements = (
  transaction: {
    id: number;
    transaction_type: "mint" | "transfer";
    delta: number;
    recipient_user_id: number;
    sender_user_id: number | null;
    status: "pending" | "active";
  },
  revokerUserId: number,
  revokedAt: number,
  reason: string | null,
): Statement[] => {
  const revoke: Statement = {
    sql: `UPDATE transactions
           SET status = 'revoked', revoked_by_user_id = ?, revoked_at = ?, revoke_reason = ?
           WHERE id = ? AND status = ?`,
    params: [
      revokerUserId,
      revokedAt,
      reason,
      transaction.id,
      transaction.status,
    ],
  };
  const sender = transaction.transaction_type === "transfer"
    ? transaction.sender_user_id
    : null;

  // `changes()` is the row count of the previous statement in the batch
  if (transaction.status === "pending") {
    if (sender === null) return [revoke];
    const unreserve: Statement = {
      sql: `UPDATE users SET reserved_mps = reserved_mps - ?
             WHERE id = ? AND changes() = 1`,
      params: [transaction.delta, sender],
    };
    return [revoke, unreserve];
  }

  const debitRecipient: Statement = {
    sql: "UPDATE users SET mps = mps - ? WHERE id = ? AND changes() = 1",
    params: [transaction.delta, transaction.recipient_user_id],
  };
  if (sender === null) return [revoke, debitRecipient];
  const refundSender: Statement = {
    sql: "UPDATE users SET mps = mps + ? WHERE id = ? AND changes() = 1",
    params: [transaction.delta, sender],
  };
  return [revoke, debitRecipient, refundSender];
};
