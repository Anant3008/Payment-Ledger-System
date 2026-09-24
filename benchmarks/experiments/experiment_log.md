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

## Experiment 005: atomic_opt
- **Date:** 2026-09-24 16:10:57
- **Hypothesis / Purpose:** Decompose transfer lifecycle latency (pool wait vs lock wait vs WAL) for [hot_wallet, opposing_transfers] under 500 VUs.
- **Configuration:** 500 VUs | Duration: 10s | DB Pool: 10 conns | Host: http://localhost:8080
- **RPS:**
  - `hot_wallet`: 657.15 r/s
  - `opposing_transfers`: 585.91 r/s
- **p50 / p95 / p99:**
  - `hot_wallet`: p50: 660.89ms | p95: 1.55s | p99: 2.03s
  - `opposing_transfers`: p50: 735.44ms | p95: 1.73s | p99: 2.22s
- **Errors:** 0.00%
- **Relevant Diagnostic Metrics:**
  - `hot_wallet`: Pool wait: 97.9% (545.39ms) | Lock wait: 2.1% (11.63ms) | DB work: 0.0% | Commit/WAL: 0.0%
  - `opposing_transfers`: Pool wait: 97.7% (533.61ms) | Lock wait: 2.3% (12.41ms) | DB work: 0.0% | Commit/WAL: 0.0%
- **Observation:** `hot_wallet` is primarily starved on Go connection pool acquisition (97.9%). `opposing_transfers` is primarily starved on Go connection pool acquisition (97.7%).

---

## Experiment 006: atomic_opt_pool50
- **Date:** 2026-09-24 16:11:52
- **Hypothesis / Purpose:** Decompose transfer lifecycle latency (pool wait vs lock wait vs WAL) for [hot_wallet, opposing_transfers] under 500 VUs.
- **Configuration:** 500 VUs | Duration: 10s | DB Pool: 50 conns | Host: http://localhost:8080
- **RPS:**
  - `hot_wallet`: 237.24 r/s
  - `opposing_transfers`: 214.02 r/s
- **p50 / p95 / p99:**
  - `hot_wallet`: p50: 1.78s | p95: 4.12s | p99: 5.37s
  - `opposing_transfers`: p50: 1.96s | p95: 4.51s | p99: 6.10s
- **Errors:** 0.00%
- **Relevant Diagnostic Metrics:**
  - `hot_wallet`: Pool wait: 88.7% (1.08s) | Lock wait: 11.3% (137.40ms) | DB work: 0.0% | Commit/WAL: 0.0%
  - `opposing_transfers`: Pool wait: 88.6% (1.09s) | Lock wait: 11.4% (140.84ms) | DB work: 0.0% | Commit/WAL: 0.0%
- **Observation:** `hot_wallet` is primarily starved on Go connection pool acquisition (88.7%). `opposing_transfers` is primarily starved on Go connection pool acquisition (88.6%).

---

## Experiment 007: single_roundtrip
- **Date:** 2026-09-24 16:14:15
- **Hypothesis / Purpose:** Evaluate 2 transfer scenario(s) across concurrency levels [10, 50, 100, 250, 500] (trials: 1x).
- **Configuration:** 10, 50, 100, 250, 500 VUs | Duration: 10s | Trials: 1x avg | Host: http://localhost:8080 | DB Pool: 10 conns
- **RPS:**
  - `hot_wallet` (500 VUs): 237.75 r/s
  - `opposing_transfers` (500 VUs): 239.65 r/s
- **p50 / p95 / p99:**
  - `hot_wallet` (500 VUs): p50: 1.80s | p95: 4.16s | p99: 5.48s
  - `opposing_transfers` (500 VUs): p50: 1.81s | p95: 3.97s | p99: 5.16s
- **Errors:** 0.00% across all scenarios
- **Relevant Diagnostic Metrics:** Peak concurrent row locks: 9 | Total deadlocks: 0 (invariant preserved)
- **Observation:** Deterministic lock ordering strictly prevented deadlocks under all loads. Hot-wallet throughput collapsed under lock contention (p99: 5.48s).

---
