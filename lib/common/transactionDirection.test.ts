/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import {
  getTransactionDirection,
  parseTransactionDirection,
} from "./transactionDirection.ts";

Deno.test("parseTransactionDirection: missing param defaults to incoming", () => {
  assertEquals(parseTransactionDirection(null), "incoming");
});

Deno.test("parseTransactionDirection: accepts outgoing", () => {
  assertEquals(parseTransactionDirection("outgoing"), "outgoing");
});

Deno.test("parseTransactionDirection: accepts incoming", () => {
  assertEquals(parseTransactionDirection("incoming"), "incoming");
});

Deno.test("parseTransactionDirection: unknown values fall back to incoming", () => {
  assertEquals(parseTransactionDirection("sideways"), "incoming");
});

Deno.test("getTransactionDirection: mint to the user is incoming", () => {
  assertEquals(
    getTransactionDirection(
      { transaction_type: "mint", sender_user_id: null },
      1,
    ),
    "incoming",
  );
});

Deno.test("getTransactionDirection: mint with the user as sender is not outgoing", () => {
  // Seeded bank mints carry sender_user_id 0 without being transfers
  assertEquals(
    getTransactionDirection({ transaction_type: "mint", sender_user_id: 0 }, 0),
    "incoming",
  );
});

Deno.test("getTransactionDirection: transfer from someone else is incoming", () => {
  assertEquals(
    getTransactionDirection(
      { transaction_type: "transfer", sender_user_id: 2 },
      1,
    ),
    "incoming",
  );
});

Deno.test("getTransactionDirection: transfer sent by the user is outgoing", () => {
  assertEquals(
    getTransactionDirection(
      { transaction_type: "transfer", sender_user_id: 1 },
      1,
    ),
    "outgoing",
  );
});
