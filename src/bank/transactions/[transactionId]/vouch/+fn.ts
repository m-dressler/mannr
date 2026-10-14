import { hasRole } from "@lib/common/roles.ts";
import { isSelfPenalty } from "@lib/common/selfPenalty.ts";
import { toActivationStatements } from "@lib/server/transaction/activate.ts";
import { vouchTransaction } from "@lib/server/transaction/vouch.ts";
import { BankData } from "../../../+types.ts";

const isValidTransactionId = (id: string | string[]): id is string =>
  typeof id === "string" && /^[0-9]+$/.test(id);

export const onRequestPost: PagesFunction<Env, "transactionId", BankData> =
  async (ctx) => {
    if (!isValidTransactionId(ctx.params.transactionId)) return ctx.next();

    const transactionId = Number(ctx.params.transactionId);
    const voucherUserId = ctx.data.token.userId;

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

    // The loser of a negative mint may always accept it, and that alone approves it
    const selfPenalty = isSelfPenalty(transaction, voucherUserId);

    if (!selfPenalty) {
      // Check if user has vouch_mt role (role 2)
      if (!hasRole(ctx.data.token.roles, "vouch_mt")) {
        return Response.json({
          message: "Insufficient permissions to vouch for transactions",
        }, { status: 403 });
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
    }

    // Insert vouch (will fail with UNIQUE constraint if already vouched)
    const vouchResult = await vouchTransaction(
      ctx.env.DB,
      transaction.id,
      voucherUserId,
    );

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
    const approved = selfPenalty || vouchCount >= transaction.required_vouches;

    // If approved, activate transaction and apply MPs in one transaction
    const results = approved
      ? await ctx.env.DB.batch(
        toActivationStatements(transaction).map(({ sql, params }) =>
          ctx.env.DB.prepare(sql).bind(...params)
        ),
      )
      : [];

    // Check for errors in batch
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      return Response.json({ message: errors[0].error }, { status: 500 });
    }

    /** Only the request that won the pending → active swap applied the MPs */
    const activated = results[0]?.meta.changes === 1;

    return Response.json({
      success: true,
      vouchCount,
      required: transaction.required_vouches,
      activated,
    });
  };
