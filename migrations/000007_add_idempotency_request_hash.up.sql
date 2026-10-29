ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);
