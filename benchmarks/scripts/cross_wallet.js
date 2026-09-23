import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const wallets = JSON.parse(open('../data/wallets.json'));
const pool = wallets.cross_wallets;

export const successfulTransfers = new Rate('successful_transfers');
export const failedTransfers = new Rate('failed_transfers');
export const transferLatency = new Trend('transfer_latency', true);

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  vus: __ENV.VUS ? parseInt(__ENV.VUS, 10) : 10,
  duration: __ENV.DURATION || '25s',
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    'http_req_failed': ['rate<0.05'],
  },
};

export default function () {
  // Random pairs from shared pool to model realistic peer-to-peer collisions
  const sIdx = Math.floor(Math.random() * pool.length);
  let rIdx = Math.floor(Math.random() * (pool.length - 1));
  if (rIdx >= sIdx) {
    rIdx += 1;
  }

  const fromWallet = pool[sIdx];
  const toWallet = pool[rIdx];

  const payload = JSON.stringify({
    from_wallet_id: fromWallet,
    to_wallet_id: toWallet,
    amount: 1,
  });

  const idempotencyKey = `cross-${__VU}-${__ITER}-${Date.now()}-${crypto.randomUUID()}`;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    timeout: '30s',
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
