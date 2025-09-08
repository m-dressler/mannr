import { createCookie, parseCookie } from "@lib/server/cookie.ts";
import { verifyToken } from "@lib/server/token.ts";

export const onRequest: PagesFunction<Env> = async ({
  next,
  request,
  env,
  data,
}) => {
  const url = new URL(request.url);
  // Whitelist login URL
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

  // Add info to next function
  data.token = verifyResult.payload;

  return next();
};
