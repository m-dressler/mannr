/// <reference lib="deno.ns" />
import { assertEquals, assertStringIncludes } from "@std/assert";
import { createSessionCookie } from "./cookie.ts";

Deno.test("createSessionCookie: is sent on the navigation that follows a magic link", () => {
  // `Strict` is withheld for the redirect after a link opened from a mail
  // client, which drops a freshly logged-in user back on the login page.
  assertStringIncludes(
    createSessionCookie("jwt", { maxAge: 60, hostname: "mannr.org" }),
    "SameSite=Lax",
  );
});

Deno.test("createSessionCookie: is unreadable by scripts and HTTPS-only", () => {
  const cookie = createSessionCookie("jwt", {
    maxAge: 60,
    hostname: "mannr.org",
  });

  assertStringIncludes(cookie, "; HttpOnly");
  assertStringIncludes(cookie, "; Secure");
});

Deno.test("createSessionCookie: carries the value, lifetime and site-wide scope", () => {
  assertEquals(
    createSessionCookie("jwt", { maxAge: 60, hostname: "mannr.org" }),
    "session=jwt; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=60; Domain=mannr.org",
  );
});

Deno.test("createSessionCookie: is host-only on localhost", () => {
  assertEquals(
    createSessionCookie("jwt", { maxAge: 60, hostname: "localhost" }).includes(
      "Domain=",
    ),
    false,
  );
});

Deno.test("createSessionCookie: an empty value with no lifetime clears the session", () => {
  // Must match the attributes the cookie was set with, or browsers keep it
  assertEquals(
    createSessionCookie("", { maxAge: 0, hostname: "mannr.org" }),
    "session=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0; Domain=mannr.org",
  );
});
