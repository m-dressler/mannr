/// <reference lib="deno.ns" />
import { assertEquals, assertThrows } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import transactionsSql from "../d1/transactions.sql" with { type: "text" };
import usersSql from "../d1/users.sql" with { type: "text" };
import { type Statement, toStreakStatements } from "./streak.ts";

const HOUR = 3_600_000;
const T = Date.UTC(2026, 9, 7, 20);
const USER_ID = 2;

/** A fresh in-memory copy of the D1 schema, with a 6-day streak for {@link USER_ID} */
const setupDb = () => {
  const db = new DatabaseSync(":memory:");
  // D1 enforces foreign keys by default
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(usersSql);
  db.exec(transactionsSql);
  db.prepare("UPDATE users SET streak_days = 6, streak_at = ? WHERE id = ?")
    .run(T, USER_ID);
  return db;
};

/** Runs statements the way D1's `batch()` does: in order, in one transaction */
const runBatch = (db: DatabaseSync, statements: Statement[]) => {
  db.exec("BEGIN");
  try {
    const changes = statements.map(({ sql, params }) =>
      Number(db.prepare(sql).run(...params).changes)
    );
    db.exec("COMMIT");
    return changes;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const readUser = (db: DatabaseSync) =>
  db.prepare("SELECT mps, streak_days, streak_at FROM users WHERE id = ?")
    .get(USER_ID);

const readStreakMints = (db: DatabaseSync) =>
  db.prepare(
    `SELECT delta, reason, transaction_type, created_by_user_id, status
       FROM transactions WHERE recipient_user_id = ? AND reason LIKE '%Streak'`,
  ).all(USER_ID);

const prev = { days: 6, at: T };
const next = { days: 7, at: T + 25 * HOUR };

Deno.test("toStreakStatements: a payout day advances the streak and mints the reward", () => {
  const db = setupDb();
  const { mps } = readUser(db) as { mps: number };

  runBatch(db, toStreakStatements(USER_ID, prev, next, 20));

  assertEquals(readUser(db), {
    mps: mps + 20,
    streak_days: 7,
    streak_at: next.at,
  });
  assertEquals(readStreakMints(db), [{
    delta: 20,
    reason: "7-Day Login Streak",
    transaction_type: "mint",
    created_by_user_id: 0,
    status: "active",
  }]);
});

Deno.test("toStreakStatements: a non-payout day only advances the streak", () => {
  const db = setupDb();
  const { mps } = readUser(db) as { mps: number };

  runBatch(db, toStreakStatements(USER_ID, prev, { days: 7, at: next.at }, 0));

  assertEquals(readUser(db), { mps, streak_days: 7, streak_at: next.at });
  assertEquals(readStreakMints(db), []);
});

Deno.test("toStreakStatements: parallel requests from one page load pay out once", () => {
  const db = setupDb();
  const { mps } = readUser(db) as { mps: number };

  // Both requests read the streak before either batch commits
  const first = toStreakStatements(USER_ID, prev, next, 20);
  const second = toStreakStatements(
    USER_ID,
    prev,
    { days: 7, at: next.at + 3 },
    20,
  );
  runBatch(db, first);

  assertEquals(runBatch(db, second), [0, 0, 0]);
  assertEquals(readUser(db), {
    mps: mps + 20,
    streak_days: 7,
    streak_at: next.at,
  });
  assertEquals(readStreakMints(db).length, 1);
});

Deno.test("toStreakStatements: a failed payout leaves the streak for the next request to retry", () => {
  const db = setupDb();
  const before = readUser(db);
  db.exec("DROP TABLE transactions");

  assertThrows(() =>
    runBatch(db, toStreakStatements(USER_ID, prev, next, 20))
  );
  assertEquals(readUser(db), before);
});
