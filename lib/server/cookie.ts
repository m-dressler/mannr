export const parseCookie = (str: string) =>
  str.length
    ? str
      .split(";")
      .map((v) => v.split("="))
      .reduce((acc: { [name: string]: string }, v) => {
        acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(
          v[1].trim(),
        );
        return acc;
      }, {})
    : {};

export const createCookie = (name: string, value: string, config?: {
  HttpOnly?: boolean;
  Secure?: boolean;
  Path?: string;
  SameSite?: "Strict" | "Lax" | "None";
  ["Max-Age"]?: number;
  Domain?: string;
}): string =>
  [
    `${name}=${value}`,
    ...Object.entries(config || {})
      .filter(([_, v]) => v != null && v !== false)
      .map(([k, v]) => v === true ? k : `${k}=${v}`),
  ].join("; ");

/**
 * Builds the `Set-Cookie` value for the `session` cookie. An empty `value` with
 * a `maxAge` of `0` clears it; clearing only works with the same `Path` and
 * `Domain` the cookie was set with, which is why both go through here.
 *
 * `SameSite=Lax` rather than `Strict`: a magic link is opened from a mail
 * client, so the navigation is cross-site, and a `Strict` cookie is withheld
 * for the redirect that follows it — landing a freshly logged-in user back on
 * the login page. `Lax` still withholds the cookie from cross-site requests
 * that aren't top-level `GET` navigations, so state-changing endpoints must
 * never be reachable via `GET`.
 */
export const createSessionCookie = (
  value: string,
  { maxAge, hostname }: {
    /** Lifetime in seconds */
    maxAge: number;
    /** Hostname of the request the cookie is answered to */
    hostname: string;
  },
): string =>
  createCookie("session", value, {
    HttpOnly: true,
    Secure: true,
    Path: "/",
    SameSite: "Lax",
    "Max-Age": maxAge,
    Domain: hostname === "localhost" ? undefined : "mannr.org",
  });
