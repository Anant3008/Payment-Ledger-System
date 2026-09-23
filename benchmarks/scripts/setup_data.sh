#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONTAINER_NAME="${DB_CONTAINER:-payment-ledger-system-db-1}"

echo "==> Seeding benchmark wallets into database container: ${CONTAINER_NAME}..."
docker exec -i "${CONTAINER_NAME}" psql -U postgres -d payment_ledger -v ON_ERROR_STOP=1 < "${BENCH_DIR}/config/seed_wallets.sql" > /dev/null

echo "==> Exporting wallet mapping to ${BENCH_DIR}/data/wallets.json..."
docker exec "${CONTAINER_NAME}" psql -U postgres -d payment_ledger -t -A -c "
WITH normal_senders AS (
  SELECT id, replace(owner, 'bench_normal_sender_', '')::int as idx
  FROM wallets WHERE owner LIKE 'bench_normal_sender_%' ORDER BY idx
),
normal_receivers AS (
  SELECT id, replace(owner, 'bench_normal_receiver_', '')::int as idx
  FROM wallets WHERE owner LIKE 'bench_normal_receiver_%' ORDER BY idx
),
normal_pairs AS (
  SELECT json_agg(json_build_array(s.id, r.id)) as pairs
  FROM normal_senders s JOIN normal_receivers r ON s.idx = r.idx
),
hot_sender AS (
  SELECT id FROM wallets WHERE owner = 'bench_hot_sender'
),
hot_receivers AS (
  SELECT json_agg(id) as recipients FROM wallets WHERE owner LIKE 'bench_hot_receiver_%'
),
cross_w AS (
  SELECT json_agg(id) as wallets FROM wallets WHERE owner LIKE 'bench_cross_%'
),
opposing AS (
  SELECT
    MAX(CASE WHEN owner = 'bench_opposing_A' THEN id END) as wallet_a,
    MAX(CASE WHEN owner = 'bench_opposing_B' THEN id END) as wallet_b
  FROM wallets WHERE owner IN ('bench_opposing_A', 'bench_opposing_B')
)
SELECT json_build_object(
  'normal_pairs', (SELECT pairs FROM normal_pairs),
  'hot_wallet', json_build_object(
    'sender_id', (SELECT id FROM hot_sender),
    'recipient_ids', (SELECT recipients FROM hot_receivers)
  ),
  'cross_wallets', (SELECT wallets FROM cross_w),
  'opposing', (SELECT json_build_object('wallet_a', wallet_a, 'wallet_b', wallet_b) FROM opposing)
);
" > "${BENCH_DIR}/data/wallets.json"

echo "==> Seeding complete. Wallets JSON generated."
