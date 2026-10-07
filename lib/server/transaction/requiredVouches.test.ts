/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { calculateRequiredVouches } from "./requiredVouches.ts";

Deno.test("calculateRequiredVouches: no mint goes through without an outside vouch", () => {
  // The creator's implicit vouch covers at most one of these, so even a
  // third-party mint waits on someone who is neither creator nor recipient.
  assertEquals(calculateRequiredVouches(2), 2);
  assertEquals(calculateRequiredVouches(-24), 2);
});

Deno.test("calculateRequiredVouches: rises with the absolute delta", () => {
  assertEquals(calculateRequiredVouches(25), 2);
  assertEquals(calculateRequiredVouches(-100), 3);
  assertEquals(calculateRequiredVouches(1000), 4);
});
