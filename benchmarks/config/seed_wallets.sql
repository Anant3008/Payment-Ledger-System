-- Safe seeding script with explicit statement and lock timeouts to avoid hangs
SET statement_timeout = '30s';
SET lock_timeout = '10s';

-- 0. Ensure foreign key indexes exist for high-speed cascading integrity checks
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_id ON ledger_entries(wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallets_owner ON wallets(owner);

BEGIN;

-- 1. Delete child ledger entries belonging to benchmark wallets or transactions
DELETE FROM ledger_entries
WHERE wallet_id IN (
    SELECT id FROM wallets WHERE owner LIKE 'bench\_%' ESCAPE '\'
)
OR transaction_id IN (
    SELECT id FROM transactions WHERE wallet_id IN (
        SELECT id FROM wallets WHERE owner LIKE 'bench\_%' ESCAPE '\'
    )
);

-- 2. Delete benchmark transactions
DELETE FROM transactions
WHERE wallet_id IN (
    SELECT id FROM wallets WHERE owner LIKE 'bench\_%' ESCAPE '\'
);

-- 3. Delete benchmark wallets
DELETE FROM wallets
WHERE owner LIKE 'bench\_%' ESCAPE '\';

-- 4. Clean benchmark idempotency keys from previous runs
DELETE FROM idempotency_keys
WHERE key LIKE 'norm-%' OR key LIKE 'hot-%' OR key LIKE 'cross-%' OR key LIKE 'opp-%';

-- 5. Normal wallets: 500 sender-receiver pairs = 1000 wallets
WITH inserted_normal AS (
  INSERT INTO wallets (owner, balance)
  SELECT
    CASE WHEN i % 2 = 1 THEN 'bench_normal_sender_' || ((i+1)/2)
         ELSE 'bench_normal_receiver_' || (i/2)
    END,
    CASE WHEN i % 2 = 1 THEN 10000000 ELSE 0 END
  FROM generate_series(1, 1000) AS i
  RETURNING id, owner, balance
),
inserted_normal_tx AS (
  INSERT INTO transactions (wallet_id, amount, type, status)
  SELECT id, balance, 'deposit', 'completed'
  FROM inserted_normal
  WHERE balance > 0
  RETURNING id, wallet_id, amount
)
INSERT INTO ledger_entries (transaction_id, wallet_id, amount)
SELECT id, wallet_id, amount
FROM inserted_normal_tx;

-- 6. Hot wallet: 1 hot sender + 100 recipients
WITH inserted_hot_sender AS (
  INSERT INTO wallets (owner, balance)
  VALUES ('bench_hot_sender', 500000000)
  RETURNING id, balance
),
inserted_hot_sender_tx AS (
  INSERT INTO transactions (wallet_id, amount, type, status)
  SELECT id, balance, 'deposit', 'completed'
  FROM inserted_hot_sender
  RETURNING id, wallet_id, amount
)
INSERT INTO ledger_entries (transaction_id, wallet_id, amount)
SELECT id, wallet_id, amount
FROM inserted_hot_sender_tx;

INSERT INTO wallets (owner, balance)
SELECT 'bench_hot_receiver_' || i, 0
FROM generate_series(1, 100) AS i;

-- 7. Cross wallets: 50 wallets with 10,000,000 balance each
WITH inserted_cross AS (
  INSERT INTO wallets (owner, balance)
  SELECT 'bench_cross_' || i, 10000000
  FROM generate_series(1, 50) AS i
  RETURNING id, balance
),
inserted_cross_tx AS (
  INSERT INTO transactions (wallet_id, amount, type, status)
  SELECT id, balance, 'deposit', 'completed'
  FROM inserted_cross
  RETURNING id, wallet_id, amount
)
INSERT INTO ledger_entries (transaction_id, wallet_id, amount)
SELECT id, wallet_id, amount
FROM inserted_cross_tx;

-- 8. Opposing wallets: A and B with 100,000,000 balance each
WITH inserted_opposing AS (
  INSERT INTO wallets (owner, balance)
  VALUES ('bench_opposing_A', 100000000), ('bench_opposing_B', 100000000)
  RETURNING id, balance
),
inserted_opposing_tx AS (
  INSERT INTO transactions (wallet_id, amount, type, status)
  SELECT id, balance, 'deposit', 'completed'
  FROM inserted_opposing
  RETURNING id, wallet_id, amount
)
INSERT INTO ledger_entries (transaction_id, wallet_id, amount)
SELECT id, wallet_id, amount
FROM inserted_opposing_tx;

COMMIT;
