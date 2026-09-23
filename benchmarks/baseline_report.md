# Benchmark Report: baseline

**Date:** 2026-09-23 23:36:26
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
| `normal_transfers` | 10 | 727.26 r/s | 12.24ms | 19.12ms | 25.92ms | 35.06ms | 0.00% | 0 | 0 |
| `normal_transfers` | 50 | 583.38 r/s | 76.58ms | 140.57ms | 166.75ms | 230.68ms | 0.00% | 0 | 0 |
| `normal_transfers` | 100 | 577.90 r/s | 153.43ms | 298.22ms | 356.51ms | 492.79ms | 0.00% | 0 | 0 |
| `normal_transfers` | 250 | 459.84 r/s | 467.13ms | 987.68ms | 1.19s | 1.59s | 0.00% | 0 | 0 |
| `normal_transfers` | 500 | 514.17 r/s | 839.69ms | 1.74s | 2.08s | 2.87s | 0.00% | 0 | 0 |
| `hot_wallet` | 10 | 205.24 r/s | 33.94ms | 83.65ms | 93.42ms | 150.82ms | 0.00% | 8 | 0 |
| `hot_wallet` | 50 | 218.20 r/s | 209.46ms | 374.30ms | 431.62ms | 566.60ms | 0.00% | 9 | 0 |
| `hot_wallet` | 100 | 230.90 r/s | 390.16ms | 725.01ms | 847.77ms | 1.14s | 0.00% | 9 | 0 |
| `hot_wallet` | 250 | 232.05 r/s | 954.82ms | 1.85s | 2.17s | 2.88s | 0.00% | 9 | 0 |
| `hot_wallet` | 500 | 232.45 r/s | 1.88s | 3.68s | 4.36s | 5.67s | 0.00% | 9 | 0 |
| `cross_wallet` | 10 | 542.31 r/s | 16.63ms | 24.66ms | 28.82ms | 35.84ms | 0.00% | 3 | 0 |
| `cross_wallet` | 50 | 655.03 r/s | 69.38ms | 121.20ms | 140.45ms | 186.42ms | 0.00% | 3 | 0 |
| `cross_wallet` | 100 | 612.39 r/s | 145.78ms | 275.93ms | 326.08ms | 438.23ms | 0.00% | 4 | 0 |
| `cross_wallet` | 250 | 636.81 r/s | 350.02ms | 676.46ms | 801.63ms | 1.05s | 0.00% | 3 | 0 |
| `cross_wallet` | 500 | 616.98 r/s | 709.48ms | 1.41s | 1.67s | 2.25s | 0.00% | 4 | 0 |
| `opposing_transfers` | 10 | 224.08 r/s | 31.99ms | 75.15ms | 84.31ms | 115.40ms | 0.00% | 8 | 0 |
| `opposing_transfers` | 50 | 225.74 r/s | 202.01ms | 359.70ms | 417.35ms | 554.42ms | 0.00% | 9 | 0 |
| `opposing_transfers` | 100 | 228.51 r/s | 391.01ms | 738.73ms | 865.33ms | 1.14s | 0.00% | 9 | 0 |
| `opposing_transfers` | 250 | 222.55 r/s | 986.50ms | 1.94s | 2.30s | 3.07s | 0.00% | 9 | 0 |
| `opposing_transfers` | 500 | 222.42 r/s | 1.95s | 3.84s | 4.54s | 6.03s | 0.00% | 9 | 0 |
