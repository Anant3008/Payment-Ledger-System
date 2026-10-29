DROP INDEX IF EXISTS idx_transactions_to_wallet_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS to_wallet_id;
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS check_wallet_balance_non_negative;
