# Payment Ledger System — Experiment Log

Centralized ledger of benchmark and diagnostic experiments tracking performance, latency breakdowns, and optimization milestones.

---
## Experiment 001: contention_diagnostic
- **Date:** 2026-09-24 14:14:50
- **Hypothesis / Purpose:** Decompose transfer lifecycle latency (pool wait vs lock wait vs WAL) for [hot_wallet, opposing_transfers] under 500 VUs.
- **Configuration:** 500 VUs | Duration: 12s | DB Pool: 10 conns | Host: http://localhost:8080
- **RPS:**
  - `hot_wallet`: 474.67 r/s
  - `opposing_transfers`: 430.06 r/s
- **p50 / p95 / p99:**
  - `hot_wallet`: p50: 917.81ms | p95: 2.13s | p99: 2.80s
  - `opposing_transfers`: p50: 1.02s | p95: 2.33s | p99: 3.13s
- **Errors:** 0.00%
- **Relevant Diagnostic Metrics:**
  - `hot_wallet`: Pool wait: 97.8% (916.36ms) | Lock wait: 2.0% (18.46ms) | DB work: 0.1% | Commit/WAL: 0.1%
  - `opposing_transfers`: Pool wait: 97.8% (1.00s) | Lock wait: 2.0% (20.38ms) | DB work: 0.1% | Commit/WAL: 0.1%
- **Observation:** `hot_wallet` is primarily starved on Go connection pool acquisition (97.8%). `opposing_transfers` is primarily starved on Go connection pool acquisition (97.8%).

---

## Experiment 002: pool_20
- **Date:** 2026-09-24 15:01:01
- **Hypothesis / Purpose:** Testing if max open conns to 20 would reduce the pool wait time
- **Configuration:** 500 VUs | Duration: 12s | DB Pool: 20 conns | Host: http://localhost:8080
- **RPS:**
  - `hot_wallet`: 414.12 r/s
  - `opposing_transfers`: 447.40 r/s
- **p50 / p95 / p99:**
  - `hot_wallet`: p50: 1.03s | p95: 2.44s | p99: 3.40s
  - `opposing_transfers`: p50: 976.34ms | p95: 2.23s | p99: 2.93s
- **Errors:** 0.00%
- **Relevant Diagnostic Metrics:**
  - `hot_wallet`: Pool wait: 95.5% (925.32ms) | Lock wait: 4.3% (41.19ms) | DB work: 0.1% | Commit/WAL: 0.1%
  - `opposing_transfers`: Pool wait: 95.6% (968.21ms) | Lock wait: 4.2% (42.25ms) | DB work: 0.1% | Commit/WAL: 0.1%
- **Observation:** `hot_wallet` is primarily starved on Go connection pool acquisition (95.5%). `opposing_transfers` is primarily starved on Go connection pool acquisition (95.6%).

---

## Experiment 003: pool_15
- **Date:** 2026-09-24 15:09:21
- **Hypothesis / Purpose:** Testing if max open conns to 15 would reduce the pool wait time
- **Configuration:** 500 VUs | Duration: 12s | DB Pool: 15 conns | Host: http://localhost:8080
- **RPS:**
  - `hot_wallet`: 452.77 r/s
  - `opposing_transfers`: 393.40 r/s
- **p50 / p95 / p99:**
  - `hot_wallet`: p50: 955.68ms | p95: 2.21s | p99: 2.87s
  - `opposing_transfers`: p50: 1.10s | p95: 2.49s | p99: 3.22s
- **Errors:** 0.00%
- **Relevant Diagnostic Metrics:**
  - `hot_wallet`: Pool wait: 96.7% (972.47ms) | Lock wait: 3.1% (30.84ms) | DB work: 0.1% | Commit/WAL: 0.1%
  - `opposing_transfers`: Pool wait: 96.7% (1.02s) | Lock wait: 3.1% (32.35ms) | DB work: 0.1% | Commit/WAL: 0.1%
- **Observation:** `hot_wallet` is primarily starved on Go connection pool acquisition (96.7%). `opposing_transfers` is primarily starved on Go connection pool acquisition (96.7%).

---

## Experiment 004: pool_5
- **Date:** 2026-09-24 15:15:48
- **Hypothesis / Purpose:** Testing if max open conns to 5 would reduce the pool wait time
- **Configuration:** 500 VUs | Duration: 12s | DB Pool: 5 conns | Host: http://localhost:8080
- **RPS:**
  - `hot_wallet`: 481.30 r/s
  - `opposing_transfers`: 419.76 r/s
- **p50 / p95 / p99:**
  - `hot_wallet`: p50: 910.47ms | p95: 2.07s | p99: 2.73s
  - `opposing_transfers`: p50: 1.04s | p95: 2.41s | p99: 3.18s
- **Errors:** 0.00%
- **Relevant Diagnostic Metrics:**
  - `hot_wallet`: Pool wait: 98.9% (907.43ms) | Lock wait: 0.9% (8.05ms) | DB work: 0.1% | Commit/WAL: 0.1%
  - `opposing_transfers`: Pool wait: 98.9% (884.23ms) | Lock wait: 0.9% (7.82ms) | DB work: 0.1% | Commit/WAL: 0.1%
- **Observation:** `hot_wallet` is primarily starved on Go connection pool acquisition (98.9%). `opposing_transfers` is primarily starved on Go connection pool acquisition (98.9%).

---
