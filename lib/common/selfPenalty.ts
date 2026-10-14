/**
 * Whether `userId` is the one losing MPs through a negative mint. Their
 * consent alone approves it — creating or vouching for it is against their
 * own interest — so it needs no outside vouches. Transfers never qualify.
 */
export const isSelfPenalty = (
  transaction: {
    transaction_type: "mint" | "transfer";
    delta: number;
    recipient_user_id: number;
  },
  userId: number,
): boolean =>
  transaction.transaction_type === "mint" &&
  transaction.delta < 0 &&
  transaction.recipient_user_id === userId;
