# Benchmark Report: strategy1_validation

**Date:** 2026-09-29 15:01:57
**Target Host:** `http://localhost:8080`
**Step Duration:** `25s` per test
**Trials per Level:** `3` (results show calculated averages)
**Tooling:** Grafana k6 + PostgreSQL `pg_stat` runtime instrumentation

## 1. Executive Summary

- **Deadlock Immunity:** **0 deadlocks** detected across all runs (up to 500 VUs). Deterministic lock ordering (`firstID < secondID`) prevented circular waits.
- **Statistical Stability:** Every data point represents the average of 3 repeated trials to eliminate outlier jitter.

## 2. Consolidated Benchmark Results (Averaged)

| Scenario | VUs | Throughput (RPS) | p50 | p90 | p95 | p99 | Errors | Peak Locks | Deadlocks |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `hot_wallet` | 10 | 470.59 r/s | 17.87ms | 47.50ms | 60.38ms | 92.74ms | 0.00% | 8 | 0 |
| `hot_wallet` | 50 | 239.92 r/s | 189.77ms | 338.77ms | 392.62ms | 510.10ms | 0.00% | 9 | 0 |
| `hot_wallet` | 100 | 239.09 r/s | 376.53ms | 703.52ms | 823.07ms | 1.09s | 0.00% | 9 | 0 |
| `hot_wallet` | 250 | 240.08 r/s | 915.46ms | 1.79s | 2.10s | 2.76s | 0.00% | 9 | 0 |
| `hot_wallet` | 500 | 239.39 r/s | 1.82s | 3.56s | 4.22s | 5.51s | 0.00% | 9 | 0 |
| `opposing_transfers` | 10 | 239.52 r/s | 28.95ms | 81.27ms | 102.57ms | 155.68ms | 0.00% | 8 | 0 |
| `opposing_transfers` | 50 | 234.62 r/s | 194.22ms | 348.53ms | 403.67ms | 524.28ms | 0.00% | 9 | 0 |
| `opposing_transfers` | 100 | 234.27 r/s | 384.29ms | 718.75ms | 849.28ms | 1.12s | 0.00% | 9 | 0 |
| `opposing_transfers` | 250 | 234.86 r/s | 934.85ms | 1.85s | 2.17s | 2.85s | 0.00% | 9 | 0 |
| `opposing_transfers` | 500 | 232.62 r/s | 1.87s | 3.71s | 4.36s | 5.85s | 0.00% | 9 | 0 |
