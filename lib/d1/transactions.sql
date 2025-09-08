DROP TABLE IF EXISTS transactions;

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Transaction details
  recipient_user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,

  -- Type discrimination
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('mint', 'transfer')),

  -- Transfer-specific
  sender_user_id INTEGER,

  -- Source tracking
  created_by_user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

  -- State management
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'revoked')),
  required_vouches INTEGER NOT NULL DEFAULT 0,

  -- Revocation
  revoked_by_user_id INTEGER,
  revoked_at INTEGER,
  revoke_reason TEXT,

  FOREIGN KEY (recipient_user_id) REFERENCES users(id),
  FOREIGN KEY (sender_user_id) REFERENCES users(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (revoked_by_user_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_recipient ON transactions(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_sender ON transactions(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- Seed initial transactions
INSERT INTO transactions (
  recipient_user_id, delta, reason, transaction_type, sender_user_id, created_by_user_id, created_at, status, required_vouches, revoked_by_user_id, revoked_at, revoke_reason
)
VALUES
    (1, 10000,  'Mannr Creation', 'mint', 0, 0, 1763132249, 'active', 0, NULL, 0,  NULL),
    (1, 1000,   'Trunk',          'mint', 0, 0, 1646693083, 'active', 0, NULL, 0,  NULL),
    (2, 1000,   'Trunk',          'mint', 0, 0, 1646693083, 'active', 0, NULL, 0,  NULL);
