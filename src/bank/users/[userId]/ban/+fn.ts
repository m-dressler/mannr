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
        "Insufficient permissions to ban users",
        403,
        "insufficient_permissions",
      );
    }

    const targetId = Number(ctx.params.userId);
    if (targetId === ctx.data.token.userId) {
      throw new ApiError("Cannot ban yourself", 400, "ban_self");
    }

    const target = await ctx.env.DB.prepare(
      "SELECT id, roles, banned_at FROM users WHERE id = ?",
    ).bind(targetId).first<{ id: number; roles: number; banned_at: number | null }>();

    if (!target) {
      throw new ApiError("User not found", 404, "user_not_found");
    }

    // Refuse to ban peers who also hold ban_users — sanity rail against
    // a single rogue admin unilaterally locking everyone else out.
    if (hasRole(target.roles, "ban_users")) {
      throw new ApiError(
        "Cannot ban another user with ban_users role",
        403,
        "ban_peer",
      );
    }

    if (target.banned_at !== null) {
      throw new ApiError("User is already banned", 400, "already_banned");
    }

    const now = Math.floor(Date.now() / 1000);
    const result = await ctx.env.DB.prepare(
      "UPDATE users SET banned_at = ? WHERE id = ?",
    ).bind(now, targetId).run();

    if (result.error) {
      throw new ApiError(result.error, 500, "ban_failed");
    }

    return createSuccessResponse(
      ctx.request,
      { userId: targetId, banned_at: now },
      "user_banned",
    );
  },
);
