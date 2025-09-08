import { createCookie } from "@lib/server/cookie.ts";
import {
  createToken,
  invalidateToken,
  SESSION_TOKEN_AGE_DAYS,
  validateToken,
} from "@lib/server/token.ts";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const jwt = url.searchParams.get("t");
  if (!jwt) {
    return Response.json(
      { message: "Missing search param `t`" },
      { status: 400 },
    );
  }

  // Validate token and check if it hasn't been invalidated/used
  const validateResult = await validateToken(jwt, env.APP_SECRET, env.KV);
  if (validateResult instanceof Error) {
    return Response.json({ message: validateResult.message }, { status: 400 });
  }

  const { email, userId, roles } = validateResult;

  // Immediately invalidate the token to prevent reuse
  await invalidateToken(jwt, env.APP_SECRET, env.KV);

  // Verify user still exists and is active before creating session
  const user = await env.DB.prepare(
    "SELECT * FROM users WHERE id = ? AND email = ?",
  )
    .bind(userId, email)
    .first<User>();

  if (!user) {
    return Response.json({ message: "User doesn't exist" }, { status: 400 });
  }

  const sessionToken = await createToken(
    env.APP_SECRET,
    `${SESSION_TOKEN_AGE_DAYS}d`,
    { email, userId, roles },
  );

  const maxAge = SESSION_TOKEN_AGE_DAYS * 24 * 3600;

  return new Response(null, {
    status: 302,
    headers: {
      "Set-Cookie": createCookie("session", sessionToken, {
        HttpOnly: true,
        Secure: true,
        Path: "/",
        SameSite: "Strict",
        "Max-Age": maxAge,
        Domain: url.hostname === "localhost" ? undefined : "mannr.org",
      }),
      Location: "/bank",
    },
  });
};
