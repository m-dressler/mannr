import { hasRole } from "@lib/common/roles.ts";
import { BankData } from "../../../+types.ts";

const isValidTransactionId = (id: string | string[]): id is string =>
  typeof id === "string" && /^[0-9]+$/.test(id);

export const onRequestPost: PagesFunction<Env, "transactionId", BankData> =
  async (ctx) => {
    if (!isValidTransactionId(ctx.params.transactionId)) return ctx.next();

    const transactionId = Number(ctx.params.transactionId);
    const revokerUserId = ctx.data.token.userId;

    if (!hasRole(ctx.data.token.roles, "revoke_transaction")) {
      return Response.json({
        message: "Insufficient permissions to revoke transactions",
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

    // Check transaction is not already revoked
    if (transaction.status === "revoked") {
      return Response.json({
        message: "Transaction is already revoked",
      }, { status: 400 });
    }

    // Get revoke reason from form
    const body = await ctx.request.formData();
    const revokeReason = body.get("reason");
    const finalReason = (revokeReason && typeof revokeReason === "string")
      ? revokeReason
      : null;

    // Reverse the transaction based on status
    if (transaction.status === "active") {
      // Transaction was activated - reverse the balance changes
      if (transaction.transaction_type === "transfer") {
        // Reverse both sides of transfer
        if (transaction.sender_user_id === null) {
          return Response.json({
            message: "Transfer transaction missing sender_user_id",
          }, { status: 500 });
        }

        await ctx.env.DB.batch([
          // Reverse recipient
          ctx.env.DB.prepare(
            "UPDATE users SET mps = mps - ? WHERE id = ?",
          ).bind(transaction.delta, transaction.recipient_user_id),
          // Reverse sender (give back the mps)
          ctx.env.DB.prepare(
            "UPDATE users SET mps = mps + ? WHERE id = ?",
          ).bind(transaction.delta, transaction.sender_user_id),
        ]);
      } else {
        // Mint transaction - just reverse recipient
        const reverseResult = await ctx.env.DB.prepare(
          "UPDATE users SET mps = mps - ? WHERE id = ?",
        ).bind(transaction.delta, transaction.recipient_user_id).run();

        if (reverseResult.error) {
          return Response.json({
            message: reverseResult.error,
          }, { status: 500 });
        }
      }
    } else if (transaction.status === "pending" && transaction.transaction_type === "transfer" && transaction.sender_user_id !== null) {
      // Transaction is pending - unreserve the funds
      await ctx.env.DB.prepare(
        "UPDATE users SET reserved_mps = reserved_mps - ? WHERE id = ?",
      ).bind(transaction.delta, transaction.sender_user_id).run();
    }

    // Mark transaction as revoked
    const revokeResult = await ctx.env.DB.prepare(
      `UPDATE transactions
       SET status = 'revoked', revoked_by_user_id = ?, revoked_at = ?, revoke_reason = ?
       WHERE id = ?`,
    ).bind(
      revokerUserId,
      Math.floor(Date.now() / 1000),
      finalReason,
      transactionId,
    ).run();

    if (revokeResult.error) {
      return Response.json({ message: revokeResult.error }, { status: 500 });
    }

    return Response.json({
      success: true,
      message: "Transaction revoked successfully",
    });
  };
