import { hasRole } from "@lib/common/roles.ts";
import { BankData } from "../../../+types.ts";

const isValidTransactionId = (id: string | string[]): id is string =>
  typeof id === "string" && /^[0-9]+$/.test(id);

export const onRequestPost: PagesFunction<Env, "transactionId", BankData> =
  async (ctx) => {
    if (!isValidTransactionId(ctx.params.transactionId)) return ctx.next();

    const transactionId = Number(ctx.params.transactionId);
    const voucherUserId = ctx.data.token.userId;

    // Check if user has vouch_mt role (role 2)
    if (!hasRole(ctx.data.token.roles, "vouch_mt")) {
      return Response.json({
        message: "Insufficient permissions to vouch for transactions",
      }, { status: 403 });
    }

    // Get the transaction
    const transaction = await ctx.env.DB.prepare(
      "SELECT * FROM transactions WHERE id = ?",
    ).bind(transactionId).first<Transaction>();

    if (!transaction) {
      return Response.json({
        message: `Transaction with ID ${transactionId} not found`,
      }, { status: 404 });
    }

    // Check transaction is pending
    if (transaction.status !== "pending") {
      return Response.json({
        message: `Transaction is ${transaction.status}, cannot vouch`,
      }, { status: 400 });
    }

    // Cannot vouch for own transactions
    if (transaction.created_by_user_id === voucherUserId) {
      return Response.json({
        message: "Cannot vouch for your own transactions",
      }, { status: 400 });
    }

    // Cannot vouch if you're the recipient
    if (transaction.recipient_user_id === voucherUserId) {
      return Response.json({
        message: "Cannot vouch for transactions you are receiving",
      }, { status: 400 });
    }

    // Insert vouch (will fail with UNIQUE constraint if already vouched)
    const vouchResult = await ctx.env.DB.prepare(
      `INSERT INTO transaction_vouches (transaction_id, voucher_user_id)
       VALUES (?, ?)`,
    ).bind(transactionId, voucherUserId).run().catch((error: Error) => ({
      success: false,
      error: error.message,
    }));

    if (vouchResult.error) {
      // Check if it's a duplicate vouch
      if (vouchResult.error.includes("UNIQUE")) {
        return Response.json({
          message: "You have already vouched for this transaction",
        }, { status: 400 });
      }
      return Response.json({ message: vouchResult.error }, { status: 500 });
    }

    // Count total vouches
    const vouchCountResult = await ctx.env.DB.prepare(
      "SELECT COUNT(*) as count FROM transaction_vouches WHERE transaction_id = ?",
    ).bind(transactionId).first<{ count: number }>();

    const vouchCount = vouchCountResult?.count ?? 0;

    // If threshold met, activate transaction and apply MPs
    if (vouchCount >= transaction.required_vouches) {
      // Update transaction status
      await ctx.env.DB.prepare(
        "UPDATE transactions SET status = 'active' WHERE id = ?",
      ).bind(transactionId).run();

      // Apply balance changes based on transaction type
      if (
        transaction.transaction_type === "transfer" &&
        transaction.sender_user_id !== null
      ) {
        // For transfers: deduct from sender, add to recipient, unreserve
        const batchResult = await ctx.env.DB.batch([
          ctx.env.DB.prepare(
            "UPDATE users SET mps = mps - ?, reserved_mps = reserved_mps - ? WHERE id = ?",
          ).bind(
            transaction.delta,
            transaction.delta,
            transaction.sender_user_id,
          ),
          ctx.env.DB.prepare(
            "UPDATE users SET mps = mps + ? WHERE id = ?",
          ).bind(transaction.delta, transaction.recipient_user_id),
        ]);

        // Check for errors in batch
        const errors = batchResult.filter((r) => r.error);
        if (errors.length > 0) {
          return Response.json({ message: errors[0].error }, { status: 500 });
        }
      } else {
        // For mints: only add to recipient
        const updateResult = await ctx.env.DB.prepare(
          "UPDATE users SET mps = mps + ? WHERE id = ?",
        ).bind(transaction.delta, transaction.recipient_user_id).run();

        if (updateResult.error) {
          return Response.json({ message: updateResult.error }, {
            status: 500,
          });
        }
      }
    }

    return Response.json({
      success: true,
      vouchCount,
      required: transaction.required_vouches,
      activated: vouchCount >= transaction.required_vouches,
    });
  };
