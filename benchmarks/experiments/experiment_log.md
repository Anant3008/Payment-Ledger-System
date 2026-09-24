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
- **Next Step:** Test increasing database connection pool (e.g. pool=25/50) or explore asynchronous append-only transaction batching.

---
