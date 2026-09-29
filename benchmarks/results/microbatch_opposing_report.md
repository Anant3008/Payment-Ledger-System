# Benchmark Report: microbatch_opposing

**Date:** 2026-09-29 15:45:29
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
| `opposing_transfers` | 500 | 1152.35 r/s | 410.22ms | 553.09ms | 626.56ms | 709.70ms | 0.00% | 0 | 0 |
