import { toUiUser } from "@lib/server/user.ts";
import { BankData } from "../+types.ts";

export const onRequestGet: PagesFunction<Env, string, BankData> = async (
  { request, env },
) => {
  if (!request.headers.get("Accept")?.includes("application/json")) {
    return new Response(null, { status: 302, headers: { location: "/bank" } });
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM users WHERE id != 0 ORDER BY mps DESC LIMIT 20",
  ).all<User>();
  return Response.json(results.map(toUiUser));
};
