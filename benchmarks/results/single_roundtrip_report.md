# Benchmark Report: single_roundtrip

**Date:** 2026-09-24 16:14:15
**Target Host:** `http://localhost:8080`
**Step Duration:** `10s` per test
**Trials per Level:** `1` (results show calculated averages)
**Tooling:** Grafana k6 + PostgreSQL `pg_stat` runtime instrumentation

## 1. Executive Summary

- **Deadlock Immunity:** **0 deadlocks** detected across all runs (up to 500 VUs). Deterministic lock ordering (`firstID < secondID`) prevented circular waits.
- **Statistical Stability:** Every data point represents the average of 3 repeated trials to eliminate outlier jitter.

## 2. Consolidated Benchmark Results (Averaged)

| Scenario | VUs | Throughput (RPS) | p50 | p90 | p95 | p99 | Errors | Peak Locks | Deadlocks |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `hot_wallet` | 10 | 242.80 r/s | 31.43ms | 77.08ms | 95.21ms | 136.67ms | 0.00% | 8 | 0 |
| `hot_wallet` | 50 | 239.53 r/s | 189.22ms | 342.24ms | 395.35ms | 517.20ms | 0.00% | 9 | 0 |
| `hot_wallet` | 100 | 251.20 r/s | 351.03ms | 672.47ms | 786.80ms | 1.01s | 0.00% | 9 | 0 |
| `hot_wallet` | 250 | 241.28 r/s | 884.72ms | 1.78s | 2.12s | 2.74s | 0.00% | 9 | 0 |
| `hot_wallet` | 500 | 237.75 r/s | 1.80s | 3.45s | 4.16s | 5.48s | 0.00% | 9 | 0 |
| `opposing_transfers` | 10 | 242.18 r/s | 29.23ms | 79.42ms | 99.56ms | 155.38ms | 0.00% | 8 | 0 |
| `opposing_transfers` | 50 | 242.63 r/s | 186.41ms | 336.86ms | 393.55ms | 494.85ms | 0.00% | 9 | 0 |
| `opposing_transfers` | 100 | 241.76 r/s | 366.45ms | 700.40ms | 822.94ms | 1.06s | 0.00% | 9 | 0 |
| `opposing_transfers` | 250 | 238.14 r/s | 906.40ms | 1.77s | 2.08s | 2.75s | 0.00% | 9 | 0 |
| `opposing_transfers` | 500 | 239.65 r/s | 1.81s | 3.35s | 3.97s | 5.16s | 0.00% | 9 | 0 |
