# Baseline Benchmark Report: Payment Ledger System

**Date:** 2026-09-23 16:19:59
**Target Host:** `http://localhost:8080`
**Test Duration:** `10s` per concurrency level
**Tooling:** Grafana k6 + PostgreSQL `pg_stat` runtime instrumentation

## 1. Executive Summary

- **Deadlock Immunity:** **0 deadlocks** occurred across all runs (up to 500 concurrent requests). The deterministic row-ordering algorithm (`MIN(id) FOR UPDATE` then `MAX(id) FOR UPDATE`) definitively prevented circular wait hazards.
- **Hot-Wallet Contention Bottleneck:** As concurrency increases against a single wallet, transactions serialize sequentially on PostgreSQL row locks, increasing p99 latency.
- **Balance Invariants:** Global ledger balance parity was preserved with exact zero drift.

## 2. Consolidated Performance Profile

| Scenario | VUs | Throughput | Avg | p50 | p90 | p95 | p99 | Max | Error Rate |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `normal_transfers` | 10 | 728.28 r/s | 13.31ms | 11.74ms | 18.35ms | 26.09ms | 36.89ms | 53.42ms | 0.00% |
| `normal_transfers` | 50 | 1051.19 r/s | 47.12ms | 42.79ms | 76.54ms | 89.10ms | 119.16ms | 172.73ms | 0.00% |
| `normal_transfers` | 100 | 680.46 r/s | 145.81ms | 127.21ms | 256.59ms | 307.95ms | 427.08ms | 662.81ms | 0.00% |
| `normal_transfers` | 250 | 1099.55 r/s | 225.02ms | 199.84ms | 395.40ms | 464.26ms | 649.73ms | 1.06s | 0.00% |
| `normal_transfers` | 500 | 1037.36 r/s | 470.11ms | 413.11ms | 829.67ms | 987.03ms | 1.33s | 2.78s | 0.00% |
| `hot_wallet` | 10 | 366.01 r/s | 26.96ms | 11.16ms | 39.53ms | 125.03ms | 328.02ms | 746.01ms | 0.00% |
| `hot_wallet` | 50 | 257.69 r/s | 192.22ms | 174.96ms | 322.81ms | 380.13ms | 485.89ms | 815.12ms | 0.00% |
| `hot_wallet` | 100 | 226.70 r/s | 434.99ms | 396.29ms | 734.55ms | 860.14ms | 1.13s | 1.59s | 0.00% |
| `hot_wallet` | 250 | 186.90 r/s | 1.28s | 1.12s | 2.29s | 2.78s | 3.54s | 5.13s | 0.00% |
| `hot_wallet` | 500 | 221.12 r/s | 2.13s | 1.90s | 3.61s | 4.35s | 5.92s | 8.88s | 0.00% |
| `cross_wallet` | 10 | 513.51 r/s | 19.08ms | 17.26ms | 26.69ms | 31.47ms | 40.18ms | 72.97ms | 0.00% |
| `cross_wallet` | 50 | 622.22 r/s | 79.78ms | 72.77ms | 127.61ms | 147.97ms | 194.10ms | 335.20ms | 0.00% |
| `cross_wallet` | 100 | 567.83 r/s | 174.90ms | 157.12ms | 297.84ms | 347.58ms | 463.55ms | 682.64ms | 0.00% |
| `cross_wallet` | 250 | 595.59 r/s | 413.79ms | 367.90ms | 723.99ms | 857.27ms | 1.17s | 2.01s | 0.00% |
| `cross_wallet` | 500 | 589.04 r/s | 823.15ms | 733.88ms | 1.45s | 1.69s | 2.25s | 3.56s | 0.00% |
| `opposing_transfers` | 10 | 210.58 r/s | 47.11ms | 35.30ms | 83.78ms | 91.09ms | 107.01ms | 210.58ms | 0.00% |
| `opposing_transfers` | 50 | 191.66 r/s | 258.27ms | 234.71ms | 427.56ms | 498.00ms | 661.45ms | 1.13s | 0.00% |
| `opposing_transfers` | 100 | 226.33 r/s | 435.05ms | 391.71ms | 745.81ms | 862.21ms | 1.15s | 2.08s | 0.00% |
| `opposing_transfers` | 250 | 227.42 r/s | 1.06s | 957.03ms | 1.84s | 2.17s | 3.04s | 4.33s | 0.00% |
| `opposing_transfers` | 500 | 225.04 r/s | 2.09s | 1.89s | 3.62s | 4.18s | 5.46s | 8.68s | 0.00% |

## 3. Database Lock Contention & Integrity

| Scenario | VUs | Peak Lock Waits | Avg Lock Waits | Peak Active Conns | DB Commits | Deadlocks |
|:---|---:|---:|---:|---:|---:|---:|
| `normal_transfers` | 10 | 2 | 0.07 | 11 | 23573 | 0 |
| `normal_transfers` | 50 | 0 | 0.00 | 11 | 30721 | 0 |
| `normal_transfers` | 100 | 0 | 0.00 | 11 | 21896 | 0 |
| `normal_transfers` | 250 | 0 | 0.00 | 12 | 33771 | 0 |
| `normal_transfers` | 500 | 0 | 0.00 | 12 | 32081 | 0 |
| `hot_wallet` | 10 | 8 | 7.31 | 11 | 11112 | 0 |
| `hot_wallet` | 50 | 9 | 6.91 | 12 | 8082 | 0 |
| `hot_wallet` | 100 | 9 | 6.55 | 12 | 7378 | 0 |
| `hot_wallet` | 250 | 9 | 6.41 | 12 | 6323 | 0 |
| `hot_wallet` | 500 | 9 | 6.67 | 12 | 7945 | 0 |
| `cross_wallet` | 10 | 2 | 0.30 | 11 | 16865 | 0 |
| `cross_wallet` | 50 | 3 | 0.39 | 12 | 19168 | 0 |
| `cross_wallet` | 100 | 3 | 0.51 | 12 | 17345 | 0 |
| `cross_wallet` | 250 | 2 | 0.43 | 12 | 18417 | 0 |
| `cross_wallet` | 500 | 2 | 0.41 | 11 | 18683 | 0 |
| `opposing_transfers` | 10 | 8 | 6.86 | 12 | 6764 | 0 |
| `opposing_transfers` | 50 | 9 | 6.76 | 12 | 5974 | 0 |
| `opposing_transfers` | 100 | 9 | 6.72 | 11 | 7482 | 0 |
| `opposing_transfers` | 250 | 9 | 6.67 | 12 | 7448 | 0 |
| `opposing_transfers` | 500 | 9 | 6.52 | 12 | 8112 | 0 |

## 4. Scenario Breakdown

### `normal_transfers`

| VUs | Throughput | p50 | p95 | p99 | Errors | Peak Locks | Deadlocks |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 728.28 r/s | 11.74ms | 26.09ms | 36.89ms | 0.00% | 2 | 0 |
| 50 | 1051.19 r/s | 42.79ms | 89.10ms | 119.16ms | 0.00% | 0 | 0 |
| 100 | 680.46 r/s | 127.21ms | 307.95ms | 427.08ms | 0.00% | 0 | 0 |
| 250 | 1099.55 r/s | 199.84ms | 464.26ms | 649.73ms | 0.00% | 0 | 0 |
| 500 | 1037.36 r/s | 413.11ms | 987.03ms | 1.33s | 0.00% | 0 | 0 |

### `hot_wallet`

| VUs | Throughput | p50 | p95 | p99 | Errors | Peak Locks | Deadlocks |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 366.01 r/s | 11.16ms | 125.03ms | 328.02ms | 0.00% | 8 | 0 |
| 50 | 257.69 r/s | 174.96ms | 380.13ms | 485.89ms | 0.00% | 9 | 0 |
| 100 | 226.70 r/s | 396.29ms | 860.14ms | 1.13s | 0.00% | 9 | 0 |
| 250 | 186.90 r/s | 1.12s | 2.78s | 3.54s | 0.00% | 9 | 0 |
| 500 | 221.12 r/s | 1.90s | 4.35s | 5.92s | 0.00% | 9 | 0 |

### `cross_wallet`

| VUs | Throughput | p50 | p95 | p99 | Errors | Peak Locks | Deadlocks |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 513.51 r/s | 17.26ms | 31.47ms | 40.18ms | 0.00% | 2 | 0 |
| 50 | 622.22 r/s | 72.77ms | 147.97ms | 194.10ms | 0.00% | 3 | 0 |
| 100 | 567.83 r/s | 157.12ms | 347.58ms | 463.55ms | 0.00% | 3 | 0 |
| 250 | 595.59 r/s | 367.90ms | 857.27ms | 1.17s | 0.00% | 2 | 0 |
| 500 | 589.04 r/s | 733.88ms | 1.69s | 2.25s | 0.00% | 2 | 0 |

### `opposing_transfers`

| VUs | Throughput | p50 | p95 | p99 | Errors | Peak Locks | Deadlocks |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 210.58 r/s | 35.30ms | 91.09ms | 107.01ms | 0.00% | 8 | 0 |
| 50 | 191.66 r/s | 234.71ms | 498.00ms | 661.45ms | 0.00% | 9 | 0 |
| 100 | 226.33 r/s | 391.71ms | 862.21ms | 1.15s | 0.00% | 9 | 0 |
| 250 | 227.42 r/s | 957.03ms | 2.17s | 3.04s | 0.00% | 9 | 0 |
| 500 | 225.04 r/s | 1.89s | 4.18s | 5.46s | 0.00% | 9 | 0 |
