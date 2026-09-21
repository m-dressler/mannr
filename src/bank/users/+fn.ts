import { toUiUser } from "@lib/server/user.ts";
import { BankData } from "../+types.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parsePositiveInt = (raw: string | null, fallback: number) => {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const onRequestGet: PagesFunction<Env, string, BankData> = async (
  { request, env },
) => {
  if (!request.headers.get("Accept")?.includes("application/json")) {
    return new Response(null, { status: 302, headers: { location: "/bank" } });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const offset = parsePositiveInt(url.searchParams.get("offset"), 0);
  const search = (url.searchParams.get("q") ?? "").trim();

  // System user (id 0) is excluded from listings everywhere
  let query =
    "SELECT * FROM users WHERE id != 0 ORDER BY mps DESC LIMIT ? OFFSET ?";
  let bindings: unknown[] = [limit, offset];

  if (search.length > 0) {
    // Match prefix or substring on first/last/email so a typed letter narrows quickly
    const like = `%${search}%`;
    query =
      `SELECT * FROM users
         WHERE id != 0
           AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)
         ORDER BY mps DESC LIMIT ? OFFSET ?`;
    bindings = [like, like, like, limit, offset];
  }

  const { results } = await env.DB.prepare(query).bind(...bindings).all<User>();
  return Response.json(results.map(toUiUser));
};
