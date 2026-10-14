/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { isSelfPenalty } from "./selfPenalty.ts";

Deno.test("isSelfPenalty: negative mint on the user is a self-penalty", () => {
  assertEquals(
    isSelfPenalty(
      { transaction_type: "mint", delta: -10, recipient_user_id: 1 },
      1,
    ),
    true,
  );
});

Deno.test("isSelfPenalty: negative mint on someone else is not", () => {
  assertEquals(
    isSelfPenalty(
      { transaction_type: "mint", delta: -10, recipient_user_id: 2 },
      1,
    ),
    false,
  );
});

Deno.test("isSelfPenalty: positive mint on the user is not", () => {
  assertEquals(
    isSelfPenalty(
      { transaction_type: "mint", delta: 10, recipient_user_id: 1 },
      1,
    ),
    false,
  );
});

Deno.test("isSelfPenalty: transfers never are", () => {
  // Negative transfers are stored with swapped parties and a positive delta,
  // but a negative one must not count either
  assertEquals(
    isSelfPenalty(
      { transaction_type: "transfer", delta: -10, recipient_user_id: 1 },
      1,
    ),
    false,
  );
});
