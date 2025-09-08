type Env = {
  DB: D1Database;
  KV: KVNamespace;
  APP_SECRET: string;
  RESEND_API_KEY: string;
};

type User = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  mps: number;
  reserved_mps: number;
  roles: number;
};

/** The user information as available in the UI with private info redacted */
type UiUser = Omit<User, "email"> & { gravatarId: string };

type BankMetadata = {
  roles: {
    0: "access_platform";
    1: "transfer_mt";
    2: "vouch_mt";
    3: "invite_user";
    4: "create_mt";
    5: "ban_users";
    6: "revoke_transaction";
  };
  standardTransactions: { [id: string]: [name: string, delta: number] };
  vouchThresholds: Array<
    { minAbsDelta: number; requiredVouches: number }
  >;
};

type Transaction = {
  id: number;
  recipient_user_id: number;
  delta: number;
  reason: string;
  transaction_type: "mint" | "transfer";
  sender_user_id: number | null;
  created_by_user_id: number;
  created_at: number;
  status: "pending" | "active" | "revoked";
  required_vouches: number;
  revoked_by_user_id: number | null;
  revoked_at: number | null;
  revoke_reason: string | null;
};

type TransactionVouch = {
  id: number;
  transaction_id: number;
  voucher_user_id: number;
  vouched_at: number;
};
