import { createCookie, parseCookie } from "@lib/server/cookie.ts";
import { verifyToken } from "@lib/server/token.ts";

export const onRequest: PagesFunction<Env> = async ({
  next,
  request,
  env,
  data,
}) => {
  const url = new URL(request.url);
  // Whitelist login URL so unauthenticated/banned users can still get there
  if (/^\/bank\/login(\/|$)/.test(url.pathname)) return next();

  const { session: token } = parseCookie(request.headers.get("Cookie") || "");
  if (!token) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/bank/login" },
    });
  }

  const verifyResult = await verifyToken(token, env.APP_SECRET);
  // Clear invalid session cookie and redirect to login
  if (verifyResult instanceof Error) {
    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": createCookie("session", "", {
          HttpOnly: true,
          Secure: true,
          Path: "/",
          SameSite: "Strict",
          "Max-Age": 0,
          Domain: url.hostname === "localhost" ? undefined : "mannr.org",
        }),
        Location: "/bank/login",
      },
    });
  }

  // The JWT carries the roles snapshot from sign-in time. Re-read from DB so
  // promotion/demotion/ban takes effect on the next request instead of
  // requiring the user to re-login.
  const live = await env.DB.prepare(
    "SELECT roles, banned_at FROM users WHERE id = ?",
  ).bind(verifyResult.payload.userId).first<
    { roles: number; banned_at: number | null }
  >();

  if (!live) {
    // Account vanished — drop the session and bounce back to login
    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": createCookie("session", "", {
          HttpOnly: true,
          Secure: true,
          Path: "/",
          SameSite: "Strict",
          "Max-Age": 0,
          Domain: url.hostname === "localhost" ? undefined : "mannr.org",
        }),
        Location: "/bank/login",
      },
    });
  }

  if (live.banned_at !== null) {
    const bannedPage = await env.ASSETS.fetch(
      new URL("/bank/banned/", request.url),
    );
    return new Response(await bannedPage.text(), {
      status: 403,
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  // Pass the fresh roles (and JWT defaults) downstream
  data.token = { ...verifyResult.payload, roles: live.roles };

  return next();
};
