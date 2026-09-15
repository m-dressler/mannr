/** Which side of a transaction a user is on: receiving MPs or sending them */
export type TransactionDirection = "incoming" | "outgoing";

/**
 * Parses the `direction` query param of a user's transaction history.
 * Anything other than `outgoing` means received transactions — the default view.
 */
export const parseTransactionDirection = (
  value: string | null,
): TransactionDirection => value === "outgoing" ? "outgoing" : "incoming";

/**
 * Direction of a transaction from the perspective of `userId`: outgoing only
 * for transfers the user sent. Everything else — mints and revocations
 * included — counts as incoming, even when a mint carries a sender (seeded
 * bank mints do).
 */
export const getTransactionDirection = (
  transaction: {
    transaction_type: "mint" | "transfer";
    sender_user_id: number | null;
  },
  userId: number,
): TransactionDirection =>
  transaction.transaction_type === "transfer" &&
    transaction.sender_user_id === userId
    ? "outgoing"
    : "incoming";
