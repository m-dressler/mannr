import { hasRole } from "@lib/common/roles.ts";
import { toRevocationStatements } from "@lib/server/transaction/revoke.ts";
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

    if (
      transaction.transaction_type === "transfer" &&
      transaction.sender_user_id === null
    ) {
      return Response.json({
        message: "Transfer transaction missing sender_user_id",
      }, { status: 500 });
    }

    // Mark transaction as revoked and reverse it based on status, in one transaction
    const results = await ctx.env.DB.batch(
      toRevocationStatements(
        // Re-pick `status` so TS sees it narrowed past "revoked"
        { ...transaction, status: transaction.status },
        revokerUserId,
        Math.floor(Date.now() / 1000),
        finalReason,
      ).map(({ sql, params }) => ctx.env.DB.prepare(sql).bind(...params)),
    );

    // Check for errors in batch
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      return Response.json({ message: errors[0].error }, { status: 500 });
    }

    // Revoked or activated by someone else since we read it
    if (results[0].meta.changes !== 1) {
      return Response.json({
        message: "Transaction changed in the meantime, reload and try again",
      }, { status: 409 });
    }

    return Response.json({
      success: true,
      message: "Transaction revoked successfully",
    });
  };
