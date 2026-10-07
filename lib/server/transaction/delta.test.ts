/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { isValidDelta } from "./delta.ts";

Deno.test("isValidDelta: accepts non-zero integers", () => {
  assertEquals(isValidDelta(1), true);
  assertEquals(isValidDelta(-25), true);
});

Deno.test("isValidDelta: rejects zero, so no MP-less transaction is created", () => {
  assertEquals(isValidDelta(0), false);
  assertEquals(isValidDelta(-0), false);
});

Deno.test("isValidDelta: rejects unparseable input", () => {
  assertEquals(isValidDelta(parseInt("abc", 10)), false);
});
