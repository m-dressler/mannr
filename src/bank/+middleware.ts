import { createSessionCookie, parseCookie } from "@lib/server/cookie.ts";
import { recordStreakVisit } from "@lib/server/streak.ts";
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
        "Set-Cookie": createSessionCookie("", {
          maxAge: 0,
          hostname: url.hostname,
        }),
        Location: "/bank/login",
      },
    });
  }

  // The JWT carries the roles snapshot from sign-in time. Re-read from DB so
  // promotion/demotion/ban takes effect on the next request instead of
  // requiring the user to re-login.
  const live = await env.DB.prepare(
    `SELECT roles, banned_at, streak_days, streak_at
       FROM users WHERE id = ?`,
  ).bind(verifyResult.payload.userId).first<{
    roles: number;
    banned_at: number | null;
    streak_days: number;
    streak_at: number | null;
  }>();

  if (!live) {
    // Account vanished — drop the session and bounce back to login
    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": createSessionCookie("", {
          maxAge: 0,
          hostname: url.hostname,
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

  // A failed streak write must never lock anyone out of the bank
  const streakReward = await recordStreakVisit(
    env.DB,
    verifyResult.payload.userId,
    { days: live.streak_days, at: live.streak_at },
    Date.now(),
  ).catch((error) => {
    console.error("Couldn't record login streak", error);
    return 0;
  });

  // Reload the page the user opened with the toast param so they see the payout
  if (
    streakReward > 0 && request.method === "GET" &&
    request.headers.get("Sec-Fetch-Mode") === "navigate"
  ) {
    url.searchParams.set("toast", "streak_reward");
    return Response.redirect(url, 303);
  }

  // Pass the fresh roles (and JWT defaults) downstream
  data.token = { ...verifyResult.payload, roles: live.roles };

  return next();
};
