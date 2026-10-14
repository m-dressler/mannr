/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import transactionsSql from "../../d1/transactions.sql" with { type: "text" };
import usersSql from "../../d1/users.sql" with { type: "text" };
import type { Statement } from "../streak.ts";
import { toActivationStatements } from "./activate.ts";

/** A fresh in-memory copy of the D1 schema */
const setupDb = () => {
  const db = new DatabaseSync(":memory:");
  // D1 enforces foreign keys by default
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(usersSql);
  db.exec(transactionsSql);
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

type Row = {
  id: number;
  transaction_type: "mint" | "transfer";
  delta: number;
  recipient_user_id: number;
  sender_user_id: number | null;
  status: string;
};

const insertTransaction = (
  db: DatabaseSync,
  values: {
    transaction_type: "mint" | "transfer";
    delta: number;
    recipient_user_id: number;
    sender_user_id: number | null;
    status: string;
  },
): Row =>
  db.prepare(
    `INSERT INTO transactions (
       recipient_user_id, delta, reason, transaction_type, sender_user_id,
       created_by_user_id, status, required_vouches
     ) VALUES (?, ?, 'Test', ?, ?, 1, ?, 2)
     RETURNING id, transaction_type, delta, recipient_user_id, sender_user_id, status`,
  ).get(
    values.recipient_user_id,
    values.delta,
    values.transaction_type,
    values.sender_user_id,
    values.status,
  ) as Row;

const readUser = (db: DatabaseSync, id: number) =>
  db.prepare("SELECT mps, reserved_mps FROM users WHERE id = ?").get(id) as {
    mps: number;
    reserved_mps: number;
  };

const readStatus = (db: DatabaseSync, id: number) =>
  (db.prepare("SELECT status FROM transactions WHERE id = ?").get(id) as {
    status: string;
  }).status;

Deno.test("toActivationStatements: a pending mint is activated and applied", () => {
  const db = setupDb();
  const before = readUser(db, 2);
  const tx = insertTransaction(db, {
    transaction_type: "mint",
    delta: -50,
    recipient_user_id: 2,
    sender_user_id: null,
    status: "pending",
  });

  assertEquals(runBatch(db, toActivationStatements(tx)), [1, 1]);
  assertEquals(readStatus(db, tx.id), "active");
  assertEquals(readUser(db, 2).mps, before.mps - 50);
});

Deno.test("toActivationStatements: racing activations apply the mint once", () => {
  const db = setupDb();
  const before = readUser(db, 2);
  const tx = insertTransaction(db, {
    transaction_type: "mint",
    delta: -50,
    recipient_user_id: 2,
    sender_user_id: null,
    status: "pending",
  });

  // Both requests read the pending transaction before either batch commits
  runBatch(db, toActivationStatements(tx));

  assertEquals(runBatch(db, toActivationStatements(tx)), [0, 0]);
  assertEquals(readUser(db, 2).mps, before.mps - 50);
});

Deno.test("toActivationStatements: a transaction revoked in the meantime stays revoked", () => {
  const db = setupDb();
  const before = readUser(db, 2);
  const tx = insertTransaction(db, {
    transaction_type: "mint",
    delta: 50,
    recipient_user_id: 2,
    sender_user_id: null,
    status: "pending",
  });
  db.prepare("UPDATE transactions SET status = 'revoked' WHERE id = ?").run(
    tx.id,
  );

  assertEquals(runBatch(db, toActivationStatements(tx)), [0, 0]);
  assertEquals(readStatus(db, tx.id), "revoked");
  assertEquals(readUser(db, 2).mps, before.mps);
});

Deno.test("toActivationStatements: a pending transfer moves and unreserves MPs once", () => {
  const db = setupDb();
  db.prepare("UPDATE users SET reserved_mps = 30 WHERE id = 2").run();
  const sender = readUser(db, 2);
  const recipient = readUser(db, 3);
  const tx = insertTransaction(db, {
    transaction_type: "transfer",
    delta: 30,
    recipient_user_id: 3,
    sender_user_id: 2,
    status: "pending",
  });

  assertEquals(runBatch(db, toActivationStatements(tx)), [1, 1, 1]);
  assertEquals(runBatch(db, toActivationStatements(tx)), [0, 0, 0]);
  assertEquals(readUser(db, 2), {
    mps: sender.mps - 30,
    reserved_mps: sender.reserved_mps - 30,
  });
  assertEquals(readUser(db, 3).mps, recipient.mps + 30);
});
