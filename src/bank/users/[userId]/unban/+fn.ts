import { hasRole } from "@lib/common/roles.ts";
import {
  ApiError,
  createSuccessResponse,
  forwardErrors,
} from "@lib/server/error.ts";
import { BankData } from "../../../+types.ts";

const isValidUserId = (id: string | string[]): id is string =>
  typeof id === "string" && /^[0-9]+$/.test(id);

export const onRequestPost = forwardErrors<Env, "userId", BankData>(
  async (ctx) => {
    if (!isValidUserId(ctx.params.userId)) return ctx.next();

    if (!hasRole(ctx.data.token.roles, "ban_users")) {
      throw new ApiError(
        "Insufficient permissions to unban users",
        403,
        "insufficient_permissions",
      );
    }

    const targetId = Number(ctx.params.userId);

    const target = await ctx.env.DB.prepare(
      "SELECT id, banned_at FROM users WHERE id = ?",
    ).bind(targetId).first<{ id: number; banned_at: number | null }>();

    if (!target) {
      throw new ApiError("User not found", 404, "user_not_found");
    }

    if (target.banned_at === null) {
      throw new ApiError("User is not banned", 400, "not_banned");
    }

    const result = await ctx.env.DB.prepare(
      "UPDATE users SET banned_at = NULL WHERE id = ?",
    ).bind(targetId).run();

    if (result.error) {
      throw new ApiError(result.error, 500, "unban_failed");
    }

    return createSuccessResponse(
      ctx.request,
      { userId: targetId },
      "user_unbanned",
    );
  },
);
