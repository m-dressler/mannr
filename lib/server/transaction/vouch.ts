/** Inserts a vouch record into `transaction_vouches` WITHOUT applying the delta in the `transactions`/`users` tables */
export const vouchTransaction = (
  DB: D1Database,
  transactionId: number,
  voucherUserId: number,
) =>
  DB.prepare(
    `INSERT INTO transaction_vouches (transaction_id, voucher_user_id)
       VALUES (?, ?)`,
  ).bind(transactionId, voucherUserId).run().catch((error: Error) => ({
    success: false,
    error: error.message,
  }));
