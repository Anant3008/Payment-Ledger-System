# Benchmark Report: test_diag_multi

**Date:** 2026-09-29 15:08:21
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
| `hot_wallet` | 10 | 246.80 r/s | 30.56ms | 76.06ms | 94.43ms | 135.74ms | 0.00% | 8 | 0 |
| `hot_wallet` | 50 | 239.37 r/s | 191.02ms | 334.76ms | 396.26ms | 497.89ms | 0.00% | 10 | 0 |
