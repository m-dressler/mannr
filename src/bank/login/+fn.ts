import EMAIL_TEMPLATE from "@lib/server/emails/sign-up.html" with {
  type: "text"
};
import { getLocale } from "@lib/server/locale.ts";
import { template } from "@lib/server/template.ts";
import { isIPThrottled, recordLoginAttempt } from "@lib/server/throttle.ts";
import { createToken, storeValidToken } from "@lib/server/token.ts";

const EMAIL_VALIDATION_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/** Enforces minimum response time to prevent email enumeration attacks  */
const MIN_RESPONSE_TIME_MS = 200;

const getRequestedInfo = (
  request: Request<
    unknown,
    IncomingRequestCfPropertiesGeographicInformation
  >,
): string => {
  const { country: countryCode, city, timezone } = request.cf || {};
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const locale = getLocale(request);

  let location: string;
  if (!countryCode) location = "an unknown location";
  // https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-ipcountry
  else if (countryCode === "T1") location = "a Tor exit node";
  else {
    // Try to convert country code to full country name
    try {
      const countryName = new Intl.DisplayNames(locale, { type: "region" });
      location = countryName.of(countryCode) ?? countryCode;
    } catch { // Fallback if locale is unsupported or DisplayNames fails
      location = countryCode;
    }

    if (city) location = `${city}, ${location}`;
  }

  // Use timezone from CF if available, otherwise attempt locale-based fallback
  let timeZone = timezone;
  if (!timeZone) {
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timeZone = "UTC";
    }
  }

  const timestamp = new Date().toLocaleString(locale, {
    dateStyle: "full",
    timeStyle: "long",
    timeZone,
  });

  return `on ${timestamp} from ${location}${ip ? ` (IP: ${ip})` : ""}`;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Get client IP for throttling
  const clientIP = request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";

  // Check IP throttling
  const throttleResult = await isIPThrottled(clientIP, env.KV);
  if (throttleResult.throttled) {
    return Response.json(
      {
        message:
          `Too many requests. Try again in ${throttleResult.retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": `${throttleResult.retryAfter}`,
          "X-RateLimit-Reset": `${
            Math.ceil(Date.now() / 1000) + throttleResult.retryAfter
          }`,
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const formData = await request.formData();
  const email = formData.get("email");
  if (
    !(
      typeof email === "string" &&
      EMAIL_VALIDATION_REGEX.test(email.toLowerCase())
    )
  ) {
    // Invalid request doesn't cause throttling
    return Response.json(
      { message: `Invalid email provided (${email})` },
      { status: 400 },
    );
  }

  /** This request's start for {@link MIN_RESPONSE_TIME_MS} */
  const startTime = Date.now();

  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first<User>();

  let jwt: string | null = null;
  let tokenStoreError: Error | null = null;
  let emailSendError: Error | null = null;

  if (user) {
    jwt = await createToken(env.APP_SECRET, "15m", {
      email,
      userId: user.id,
      roles: user.roles,
    });

    // Store the token as valid for single-use verification
    tokenStoreError = await storeValidToken(jwt, env.APP_SECRET, env.KV) ??
      null;

    if (!tokenStoreError) {
      /** The HTML version of the email */
      const html = template(EMAIL_TEMPLATE, {
        EXPIRY_TIME: "15 minutes",
        TOKEN_URL: `https://mannr.org/bank/login/token?t=${jwt!}`,
        RECIPIENT_EMAIL: email,
        REQUESTED_INFO: getRequestedInfo(request),
        YEAR: new Date().getFullYear(),
      });

      if ("SKIP_AUTH_EMAIL" in env && env.SKIP_AUTH_EMAIL === "TRUE") {
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Mannr <no-reply@mannr.org>",
          to: email,
          subject: "Mannr Log-in Link",
          html,
        }),
      });
      if (!res.ok) {
        emailSendError = new Error("Resend send error", {
          cause: await res.json(),
        });
      }
    }
  } else {
    // Record failed login attempt
    await recordLoginAttempt(clientIP, false, env.KV);
  }

  // Record login attempt as failed if either tokenStorage or email weren't sent
  await recordLoginAttempt(
    clientIP,
    !(tokenStoreError || emailSendError),
    env.KV,
  );

  // Ensure minimum response time to prevent timing attacks
  const timeToWait = MIN_RESPONSE_TIME_MS - (Date.now() - startTime);
  if (timeToWait > 0) await new Promise((r) => setTimeout(r, timeToWait));

  if (tokenStoreError) {
    // Record failed attempt due to email service failure
    await recordLoginAttempt(clientIP, false, env.KV);
    const message = "Unable to store token: " + tokenStoreError.message;
    console.error(message, tokenStoreError.cause);
    return Response.json({ message }, { status: 500 });
  } else if (emailSendError) {
    // Record failed attempt due to email service failure
    await recordLoginAttempt(clientIP, false, env.KV);
    console.error("Couldn't send magic link email", emailSendError);
    return Response.json(
      {
        message: "We're currently experiencing log in issues. Try again later.",
      },
      { status: 500 },
    );
  } else {
    return new Response("Magic link sent", {
      status: 302,
      headers: { "Location": "/bank/login/email-sent" },
    });
  }
};
