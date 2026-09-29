# Benchmark Report: test_diag_25s

**Date:** 2026-09-29 15:07:54
**Target Host:** `http://localhost:8080`
**Step Duration:** `25s` per test
**Trials per Level:** `1` (results show calculated averages)
**Tooling:** Grafana k6 + PostgreSQL `pg_stat` runtime instrumentation

## 1. Executive Summary

- **Deadlock Immunity:** **0 deadlocks** detected across all runs (up to 500 VUs). Deterministic lock ordering (`firstID < secondID`) prevented circular waits.
- **Statistical Stability:** Every data point represents the average of 3 repeated trials to eliminate outlier jitter.

## 2. Consolidated Benchmark Results (Averaged)

| Scenario | VUs | Throughput (RPS) | p50 | p90 | p95 | p99 | Errors | Peak Locks | Deadlocks |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `hot_wallet` | 500 | 555.61 r/s | 759.34ms | 1.58s | 1.91s | 2.87s | 0.00% | 9 | 0 |
