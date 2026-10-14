/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import transactionsSql from "../../d1/transactions.sql" with { type: "text" };
import usersSql from "../../d1/users.sql" with { type: "text" };
import type { Statement } from "../streak.ts";
import { toActivationStatements } from "./activate.ts";
import { toRevocationStatements } from "./revoke.ts";

const REVOKER_ID = 1;
const REVOKED_AT = 1_760_000_000;

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
  status: "pending" | "active";
};

const insertTransaction = (
  db: DatabaseSync,
  values: Omit<Row, "id">,
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

const revoke = (tx: Row, reason: string | null = "Oops") =>
  toRevocationStatements(tx, REVOKER_ID, REVOKED_AT, reason);

const readUser = (db: DatabaseSync, id: number) =>
  db.prepare("SELECT mps, reserved_mps FROM users WHERE id = ?").get(id) as {
    mps: number;
    reserved_mps: number;
  };

const readRevocation = (db: DatabaseSync, id: number) =>
  db.prepare(
    `SELECT status, revoked_by_user_id, revoked_at, revoke_reason
       FROM transactions WHERE id = ?`,
  ).get(id);

Deno.test("toRevocationStatements: an active mint is revoked and reversed", () => {
  const db = setupDb();
  const before = readUser(db, 2);
  const tx = insertTransaction(db, {
    transaction_type: "mint",
    delta: 50,
    recipient_user_id: 2,
    sender_user_id: null,
    status: "active",
  });

  assertEquals(runBatch(db, revoke(tx)), [1, 1]);
  assertEquals(readRevocation(db, tx.id), {
    status: "revoked",
    revoked_by_user_id: REVOKER_ID,
    revoked_at: REVOKED_AT,
    revoke_reason: "Oops",
  });
  assertEquals(readUser(db, 2).mps, before.mps - 50);
});

Deno.test("toRevocationStatements: racing revocations reverse the mint once", () => {
  const db = setupDb();
  const before = readUser(db, 2);
  const tx = insertTransaction(db, {
    transaction_type: "mint",
    delta: 50,
    recipient_user_id: 2,
    sender_user_id: null,
    status: "active",
  });

  // Both requests read the active transaction before either batch commits
  runBatch(db, revoke(tx));

  assertEquals(runBatch(db, revoke(tx, "Second")), [0, 0]);
  assertEquals(readUser(db, 2).mps, before.mps - 50);
  assertEquals(
    (readRevocation(db, tx.id) as { revoke_reason: string }).revoke_reason,
    "Oops",
  );
});

Deno.test("toRevocationStatements: an active transfer is reversed on both sides", () => {
  const db = setupDb();
  const sender = readUser(db, 2);
  const recipient = readUser(db, 3);
  const tx = insertTransaction(db, {
    transaction_type: "transfer",
    delta: 30,
    recipient_user_id: 3,
    sender_user_id: 2,
    status: "active",
  });

  assertEquals(runBatch(db, revoke(tx)), [1, 1, 1]);
  assertEquals(readUser(db, 2).mps, sender.mps + 30);
  assertEquals(readUser(db, 3).mps, recipient.mps - 30);
});

Deno.test("toRevocationStatements: a pending transfer is unreserved once", () => {
  const db = setupDb();
  db.prepare("UPDATE users SET reserved_mps = 30 WHERE id = 2").run();
  const sender = readUser(db, 2);
  const tx = insertTransaction(db, {
    transaction_type: "transfer",
    delta: 30,
    recipient_user_id: 3,
    sender_user_id: 2,
    status: "pending",
  });

  assertEquals(runBatch(db, revoke(tx)), [1, 1]);
  assertEquals(runBatch(db, revoke(tx)), [0, 0]);
  assertEquals(readUser(db, 2), { ...sender, reserved_mps: 0 });
});

Deno.test("toRevocationStatements: a pending mint only changes status", () => {
  const db = setupDb();
  const before = readUser(db, 2);
  const tx = insertTransaction(db, {
    transaction_type: "mint",
    delta: 50,
    recipient_user_id: 2,
    sender_user_id: null,
    status: "pending",
  });

  assertEquals(runBatch(db, revoke(tx)), [1]);
  assertEquals(readUser(db, 2), before);
});

Deno.test("toRevocationStatements: a mint activated after it was read is left alone", () => {
  const db = setupDb();
  const before = readUser(db, 2);
  const tx = insertTransaction(db, {
    transaction_type: "mint",
    delta: 50,
    recipient_user_id: 2,
    sender_user_id: null,
    status: "pending",
  });

  // The revoker reads it as pending, then a vouch activates it first
  runBatch(db, toActivationStatements(tx));

  assertEquals(runBatch(db, revoke(tx)), [0]);
  assertEquals(
    (readRevocation(db, tx.id) as { status: string }).status,
    "active",
  );
  assertEquals(readUser(db, 2).mps, before.mps + 50);
});

Deno.test("toRevocationStatements: a pending mint revoked first can't be activated", () => {
  const db = setupDb();
  const before = readUser(db, 2);
  const tx = insertTransaction(db, {
    transaction_type: "mint",
    delta: 50,
    recipient_user_id: 2,
    sender_user_id: null,
    status: "pending",
  });

  // A voucher reads it as pending, then the revocation commits first
  runBatch(db, revoke(tx));

  assertEquals(runBatch(db, toActivationStatements(tx)), [0, 0]);
  assertEquals(readUser(db, 2), before);
});
