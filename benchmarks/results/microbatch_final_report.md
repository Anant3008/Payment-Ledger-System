# Benchmark Report: microbatch_final

**Date:** 2026-09-29 16:20:45
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
| `normal_transfers` | 10 | 501.92 r/s | 18.24ms | 29.97ms | 34.44ms | 47.34ms | 0.00% | 0 | 0 |
| `normal_transfers` | 50 | 757.37 r/s | 64.18ms | 87.28ms | 95.31ms | 113.83ms | 0.00% | 0 | 0 |
| `normal_transfers` | 100 | 952.30 r/s | 99.59ms | 150.07ms | 169.42ms | 212.45ms | 0.00% | 0 | 0 |
| `normal_transfers` | 250 | 940.25 r/s | 247.24ms | 376.53ms | 428.71ms | 551.95ms | 0.00% | 0 | 0 |
| `normal_transfers` | 500 | 920.86 r/s | 522.30ms | 665.24ms | 718.35ms | 824.56ms | 0.00% | 0 | 0 |
| `hot_wallet` | 10 | 303.83 r/s | 31.90ms | 44.69ms | 48.47ms | 56.39ms | 0.00% | 1 | 0 |
| `hot_wallet` | 50 | 738.93 r/s | 64.78ms | 90.32ms | 100.19ms | 132.78ms | 0.00% | 0 | 0 |
| `hot_wallet` | 100 | 940.31 r/s | 100.69ms | 151.69ms | 170.83ms | 214.58ms | 0.00% | 0 | 0 |
| `hot_wallet` | 250 | 991.90 r/s | 238.12ms | 341.41ms | 384.78ms | 515.77ms | 0.00% | 0 | 0 |
| `hot_wallet` | 500 | 961.35 r/s | 500.25ms | 624.16ms | 677.73ms | 793.58ms | 0.00% | 0 | 0 |
| `cross_wallet` | 10 | 311.86 r/s | 31.31ms | 42.31ms | 46.52ms | 55.31ms | 0.00% | 0 | 0 |
| `cross_wallet` | 50 | 733.10 r/s | 65.37ms | 90.30ms | 99.66ms | 126.71ms | 0.00% | 0 | 0 |
| `cross_wallet` | 100 | 960.14 r/s | 98.34ms | 148.55ms | 168.10ms | 213.72ms | 0.00% | 1 | 0 |
| `cross_wallet` | 250 | 943.16 r/s | 254.19ms | 358.38ms | 399.65ms | 491.13ms | 0.00% | 0 | 0 |
| `cross_wallet` | 500 | 928.57 r/s | 509.64ms | 670.21ms | 771.96ms | 1.07s | 0.00% | 0 | 0 |
| `opposing_transfers` | 10 | 300.80 r/s | 32.20ms | 45.25ms | 50.76ms | 63.76ms | 0.00% | 0 | 0 |
| `opposing_transfers` | 50 | 773.18 r/s | 62.21ms | 85.65ms | 94.13ms | 116.96ms | 0.00% | 0 | 0 |
| `opposing_transfers` | 100 | 962.67 r/s | 98.22ms | 149.13ms | 168.31ms | 211.08ms | 0.00% | 0 | 0 |
| `opposing_transfers` | 250 | 1014.77 r/s | 233.90ms | 330.99ms | 371.10ms | 488.74ms | 0.00% | 0 | 0 |
| `opposing_transfers` | 500 | 983.30 r/s | 484.54ms | 613.47ms | 681.08ms | 984.96ms | 0.00% | 0 | 0 |
