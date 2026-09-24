import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Load provisioned benchmark wallets
const wallets = JSON.parse(open('../data/wallets.json'));

let scenario = (__ENV.SCENARIO || 'hot_wallet').toLowerCase().replace(/[-_ ]+/g, '_');
if (scenario === 'opposing' || scenario === 'opposing_transaction' || scenario === 'opposing_transactions') {
  scenario = 'opposing_transfers';
}
if (scenario === 'hot' || scenario === 'hot_wallets') {
  scenario = 'hot_wallet';
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// Trend metrics for granular percentile tracking
export const transferLatency = new Trend('transfer_latency', true);
export const successfulTransfers = new Rate('successful_transfers');
export const failedTransfers = new Rate('failed_transfers');

export const options = {
  vus: __ENV.VUS ? parseInt(__ENV.VUS, 10) : 500,
  duration: __ENV.DURATION || '25s',
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    'http_req_failed': ['rate<0.10'],
  },
};

export default function () {
  let fromWallet, toWallet;

  if (scenario === 'hot_wallet') {
    // Hot-wallet: all VUs send from the single hot sender to rotating recipients
    fromWallet = wallets.hot_wallet.sender_id;
    const recipients = wallets.hot_wallet.recipient_ids;
    const recipientIdx = (__ITER + __VU) % recipients.length;
    toWallet = recipients[recipientIdx];
  } else if (scenario === 'opposing_transfers') {
    // Opposing transfers: 50% A->B and 50% B->A
    const forward = (__VU + __ITER) % 2 === 0;
    fromWallet = forward ? wallets.opposing.wallet_a : wallets.opposing.wallet_b;
    toWallet = forward ? wallets.opposing.wallet_b : wallets.opposing.wallet_a;
  } else {
    throw new Error(`Unknown diagnostic scenario: ${scenario}. Expected 'hot_wallet' or 'opposing_transfers'.`);
  }

  const payload = JSON.stringify({
    from_wallet_id: fromWallet,
    to_wallet_id: toWallet,
    amount: 1,
  });

  const idempotencyKey = `diag-${scenario}-${__VU}-${__ITER}-${Date.now()}-${crypto.randomUUID()}`;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    timeout: '60s',
  };

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/transfers`, payload, params);
  const duration = Date.now() - startTime;
  transferLatency.add(duration);

  const isOk = check(res, {
    'status is 200': (r) => r.status === 200,
  });

  if (isOk) {
    successfulTransfers.add(1);
    failedTransfers.add(0);
  } else {
    successfulTransfers.add(0);
    failedTransfers.add(1);
  }
}
