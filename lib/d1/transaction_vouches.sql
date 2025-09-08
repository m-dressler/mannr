DROP TABLE IF EXISTS transaction_vouches;

CREATE TABLE IF NOT EXISTS transaction_vouches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  voucher_user_id INTEGER NOT NULL,
  vouched_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (voucher_user_id) REFERENCES users(id),

  UNIQUE(transaction_id, voucher_user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vouches_transaction ON transaction_vouches(transaction_id);
