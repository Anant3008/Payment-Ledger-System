# Payment Ledger System

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat&logo=postgresql)](https://www.postgresql.org)
[![Embedded UI](https://img.shields.io/badge/Embedded%20UI-React%20SPA-61DAFB?style=flat&logo=react)](https://payment-ledger-app.onrender.com/#overview)
[![CI Tests](https://img.shields.io/badge/Tests-100%25%20Passing-brightgreen?style=flat)](https://github.com/Anant3008/Payment-Ledger-System/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A high-performance, ACID-compliant double-entry payment ledger engine built in Go and PostgreSQL. Engineered to withstand extreme single-row write contention using in-memory micro-batching (TigerBeetle / LMAX pattern), deterministic deadlock-free locking, cryptographically safe mutating idempotency, and continuous background balance reconciliation auditing.

Includes an **embedded single-page operations console and interactive Systems Lab** bundled directly into the compiled Go binary with standard library `//go:embed` — zero Node.js or build-step dependencies in production.

---

## Performance Benchmarks (500 Concurrent VUs)

Under extreme contention (500 virtual users targeting the exact same sender wallet simultaneously), standard relational databases collapse due to single-row locking and sequential disk `fsync` bottlenecks (~230 RPS). Through empirical profiling and progressive architectural iterations, this system shattered that ceiling:

| Architecture Stage | Hot-Wallet Throughput | p50 Latency | p99 Latency | Peak Locks | Bottleneck Overcome |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Baseline (Standard Multi-Query)** | 232 r/s | 1,883 ms | 5,670 ms | 9 | Network roundtrips holding row lock |
| **Strategy 1 (Atomic Engine Stored Procedure)** | 657 r/s | 660 ms | 2,034 ms | 9 | Eliminated 6 of 7 network roundtrips |
| **Strategy 2 (Micro-Batching - Sustained 3x 25s Average)** | **961 r/s** | **500 ms** | **793 ms** | **0** | **Bypassed single-row disk fsync serialization** |
| **Strategy 2 (Micro-Batching - Peak 10s Burst Capacity)** | **1,530 r/s** | **322 ms** | **400 ms** | **0** | **Max amortized throughput before WAL saturation** |

> *All benchmarks are reproducible using the automated testing suite under `benchmarks/` with multi-trial statistical averaging across concurrency levels (10 to 500 VUs). Sustained metrics reflect the 3-trial calculated average over 25-second continuous load.*

---

## System Architecture & Concurrency Pipeline

```text
HTTP Client
    │
    ▼ [POST /transfers] (Header: Idempotency-Key)
┌────────────────────────────────────────────────────────┐
│ Idempotency Middleware                                 │
│ Checks PostgreSQL key store; deduplicates retries       │
└──────────────────────────┬─────────────────────────────┘
                           │ Unique Mutation
                           ▼
┌────────────────────────────────────────────────────────┐
│ Go In-Memory Job Queue (Buffer: 5,000 items)           │
└──────────────────────────┬─────────────────────────────┘
                           │ Drain Queue
                           ▼
┌────────────────────────────────────────────────────────┐
│ Micro-Batch Worker (Go Goroutine)                     │
│ Flushes when: 50 transfers accumulate OR 2ms timer     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ Single Network Packet (Array Parameters)
┌────────────────────────────────────────────────────────┐
│ PostgreSQL Stored Procedure (process_transfer_batch)   │
│ 1. Multi-Row Deterministic Pre-Locking (min -> max ID) │
│ 2. In-Engine Balance Verifications & Atomic Updates    │
│ 3. Bulk Insert: Transactions & Balanced Ledger Entries │
│ 4. Single Transaction Commit & 1 Shared WAL Disk fsync │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ Fault Isolation (Poison-Pill Filter)
┌────────────────────────────────────────────────────────┐
│ If batch succeeds: Reply 200 OK to all 50 goroutines   │
│ If batch fails (e.g. 1 overdraft): Fall back to        │
│ sequential retry so 49 innocent transfers still commit │
└────────────────────────────────────────────────────────┘
```

---

## Financial Invariants & Correctness Guarantees

1. **Strict Double-Entry Bookkeeping:**
   - Money can neither be created nor destroyed. Every transaction generates balanced debit and credit entries in `ledger_entries`:
     ```text
     SUM(debits) + SUM(credits) == 0
     ```
   - Every ledger row references an immutable `transactions` parent record for complete auditability.

2. **Zero System Money Drift (Global Reconciliation):**
   - The system satisfies the global balance invariant from day zero (including initial balances):
     ```text
     SUM(wallets.balance) == SUM(ledger_entries.amount)
     ```
   - Verified continuously by an independent background daemon (`cmd/audit-worker`).

3. **Deterministic Deadlock Prevention:**
   - Multi-account transfers lock rows strictly in ascending numerical order:
     ```text
     first_id  = min(wallet_a, wallet_b)
     second_id = max(wallet_a, wallet_b)
     ```
   - Mathematically eliminates circular wait conditions, passing brutal 40-concurrent opposing-transfer stress tests (A -> B and B -> A at the exact same millisecond) with zero SQL `40P01` deadlocks.

4. **Overdraft Protection (Non-Negative Balances):**
   - Balances are verified inside the atomic database engine lock. Overdraft attempts trigger instant rollback (`ERRCODE = 'P0001'`), returning `400 Bad Request` with zero balance mutation.

5. **Poison-Pill Fault Isolation:**
   - If an invalid transfer enters a batch of 50, the micro-batch worker automatically isolates it and retries the batch, ensuring the single invalid transfer receives a 400 error while the remaining 49 transfers commit successfully.

---

## Interactive Operations Console & Systems Lab

The platform embeds a high-density, single-page React 18 operations dashboard directly into the Go executable via `//go:embed` at `GET /`:

* **Single-Binary Zero-Dependency Runtime:** The complete user interface (React 18, Tailwind CSS, Lucide icons) is bundled into a self-contained HTML asset served directly by Go's HTTP server. No Node.js runtime, build toolchain, or separate frontend container is required in production.
* **Account Portfolio & Directory:** Live directory of accounts with active wallet switcher, instant search, and real-time balance tracking.
* **Double-Entry Ledger & Transaction Inspector:** Inspect chronological debits, credits, running balances, and cryptographic parent transaction hashes for any account.
* **Live Invariant Reconciliation:** Trigger on-demand mathematical balance audits (`GET /wallets/:id/reconcile`) verifying that `wallet.balance == SUM(ledger_entries.amount)` with zero drift.
* **Systems Lab (Interactive Experiments):** In-browser test bench to execute live scenario proofs:
  - *Overdraft Rejection:* Demonstrates database-level row-lock constraint enforcement (`CHECK balance >= 0`).
  - *Idempotency Replay:* Validates deterministic response caching and `Idempotent-Replayed: true` headers.
  - *Payload Tampering:* Confirms cryptographic SHA-256 rejection (`422 Unprocessable Entity`) on key reuse with altered payloads.
  - *Micro-Batching Stress:* Fires concurrent bursts through the worker queue to observe batching efficiency and latency metrics.

---

## Key Components & Background Daemons

- **API Server & Embedded Console (`cmd/server`, `web/`):**
  - Serves RESTful endpoints and the embedded SPA dashboard via Gin with centralized error handling, request ID tracing (`X-Request-ID`), cryptographic idempotency filtering, and graceful shutdown draining.
- **Micro-Batch Worker (`internal/services/transfer_service.go`):**
  - High-throughput asynchronous batcher combining individual HTTP intents into atomic database group commits.
- **Reconciliation Audit Worker (`cmd/audit-worker`):**
  - Background daemon running continuous single-statement MVCC balance integrity audits (`ReconcileAll`) and purging expired idempotency keys (>24h). Also capable of running as an in-process goroutine (`RUN_AUDIT_WORKER=true`) for single-container cloud environments.
- **Demo Dataset Seeder (`cmd/seed`):**
  - Idempotent database seeder that populates 25 diverse enterprise treasuries, merchants, and individual accounts ($138,605.00 volume) with zero mathematical ledger drift.

---

## Repository Structure

```text
├── cmd/
│   ├── audit-worker/             # Background daemon: continuous audit & TTL garbage collection
│   ├── seed/                     # Idempotent 25-account demonstration dataset seeder
│   └── server/                   # HTTP REST API server & batch worker initialization
├── internal/
│   ├── config/                   # Environment configuration loader
│   ├── db/                       # PostgreSQL connection pool setup
│   ├── errors/                   # Domain sentinel errors (ErrNotFound, ErrInsufficientFunds, etc.)
│   ├── handlers/                 # Gin HTTP transport layer & middleware
│   ├── models/                   # Core domain structs (Wallet, Transaction, LedgerEntry, FlexibleID)
│   ├── repository/               # Database operations, stored procedure callers, raw SQL queries
│   └── services/                 # Business logic, micro-batching worker, reconciliation auditor
├── web/                          # Embedded single-page operations dashboard
│   ├── app.tsx                   # React 18 + Tailwind UI source code
│   ├── bundle.js                 # Minified browser-executable JS bundle
│   ├── embed.go                  # Go standard library //go:embed asset wrapper
│   └── index.html                # Self-contained SPA document served at GET /
├── migrations/                   # Sequential schema migrations (golang-migrate)
│   ├── 000001_initial_schema.up.sql
│   ├── 000002_add_idempotency_keys.up.sql
│   ├── 000003_add_fk_indexes.up.sql
│   ├── 000004_add_transfer_function.up.sql
│   ├── 000005_batch_transfer_function.up.sql
│   ├── 000006_add_idempotency_created_at_idx.up.sql
│   ├── 000007_add_idempotency_request_hash.up.sql
│   └── 000008_add_balance_check_and_receiver_tx.up.sql
├── benchmarks/                   # High-concurrency k6 load testing suite
│   ├── diagnostics/              # Microsecond-level transfer lifecycle profiler
│   ├── experiments/              # Automated experiment log & JSON artifact tracker
│   ├── scripts/                  # Scenario definitions (normal, hot_wallet, cross_wallet, opposing)
│   └── run_benchmarks.py         # Multi-trial statistical benchmark runner
├── docs/
│   └── api_reference.md          # Comprehensive REST API route specifications
├── docker-compose.yml            # Multi-container local orchestration (Postgres, API, Worker)
├── Dockerfile                    # Multi-stage production container with embedded migrate & seed
├── entrypoint.sh                 # Container startup migration & seeding runner
├── render.yaml                   # 1-Click cloud deployment blueprint (Render Free Tier)
├── Makefile                      # Migration, testing, UI build, and benchmark automation targets
└── README.md
```

---

## Getting Started

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- [Go 1.22+](https://golang.org/dl/) (optional, for local development)
- [k6](https://k6.io/docs/get-started/installation/) (optional, for running load tests)

### 1. One-Command Local Launch
Boot the PostgreSQL database, API server, and background audit worker:

```bash
docker compose up -d --build
```

Verify services are healthy:
```bash
docker compose ps
curl http://localhost:8080/health
# {"status":"ok","database":{"status":"up","driver":"postgres"}}
```

Open your browser to **`http://localhost:8080/`** to interact with the **Operations Console & Systems Lab**.

### 2. Run Demo Seeder (25 Accounts)
Populate the 25 enterprise and individual demo accounts ($138,605.00 volume):
```bash
go run ./cmd/seed
# or inside Docker: docker compose exec app /seed
```

### 3. Run Automated Database Migrations (Local Dev)
If running locally outside Docker:
```bash
make migrate-up
```

### 4. Run the Full Test Suite
Executes unit tests, repository integration tests with real PostgreSQL transactions, race condition detection (`-race`), and E2E payment lifecycle tests:

```bash
make test
# or: go test -v -count=1 -race ./...
```

---

## 1-Click Cloud Deployment (Render Free Tier)

This repository includes a native Infrastructure-as-Code Blueprint (`render.yaml`) tailored for Render's 100% Free Tier:

1. Fork or push this repository to your GitHub account.
2. Sign in to [dashboard.render.com](https://dashboard.render.com/).
3. Click **New +** -> **Blueprint**.
4. Select `Payment-Ledger-System`.
5. Render automatically:
   - Provisions a managed PostgreSQL 15 database (`payment-ledger-db`).
   - Builds the multi-stage Docker container.
   - Runs database migrations (`000001`–`000008`) and populates the 25 demo accounts via `entrypoint.sh`.
   - Boots the web service (`payment-ledger-app`) with the embedded audit worker enabled (`RUN_AUDIT_WORKER=true`).
6. Open your live app URL (e.g. `https://payment-ledger-app.onrender.com/`) to access the production console.

---

## Running Benchmarks & Diagnostics

### 1. Run Baseline Load Test
Runs 3 repeated trials across 10, 50, 100, 250, and 500 VUs:
```bash
make benchmark NAME=baseline RUNS=3
```

### 2. Run Lifecycle Contention Diagnostics (The X-Ray)
Profiles nanosecond-level time spent in Connection Pool Queue vs Row Locks vs Engine Exec:
```bash
python3 benchmarks/diagnostics/contention_diagnostic.py --vus 500 --scenarios hot_wallet,opposing_transfers
```

### 3. Compare Two Experiments
Compare performance deltas side-by-side with color-coded terminal tables:
```bash
make benchmark-compare A=baseline B=microbatch_final
```

---

## API Reference Summary

> Full interactive documentation and response schemas are available in [`docs/api_reference.md`](./docs/api_reference.md).

All mutating (`POST`) endpoints require an `Idempotency-Key` header for network safety.

| Method | Endpoint | Description | Idempotency Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/` | Embedded Operations Dashboard (React 18 SPA) | No |
| `GET` | `/health` | Server readiness, DB pool metadata & engine capabilities | No |
| `GET` | `/wallets` | List all accounts in directory | No |
| `POST` | `/wallets` | Create a new wallet with optional initial balance | **Yes** |
| `GET` | `/wallets/:id` | Get wallet balance and details | No |
| `GET` | `/wallets/:id/reconcile` | Live atomic MVCC balance reconciliation audit | No |
| `POST` | `/wallets/:id/deposit` | Deposit funds atomically (creates ledger entry) | **Yes** |
| `POST` | `/wallets/:id/withdraw` | Withdraw funds atomically (verified non-negative) | **Yes** |
| `POST` | `/deposits` | Convenience body-based deposit alias (`wallet_id`, `amount`) | **Yes** |
| `POST` | `/withdrawals` | Convenience body-based withdrawal alias (`wallet_id`, `amount`) | **Yes** |
| `POST` | `/transfers` | High-throughput micro-batched transfer between wallets | **Yes** |
| `GET` | `/wallets/:id/ledger` | Paginated immutable double-entry ledger history | No |
| `GET` | `/wallets/:id/transactions` | Paginated transaction history (sender & recipient visible) | No |

### Quick Example: Atomic Money Transfer
```bash
curl -X POST http://localhost:8080/transfers \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: transfer-tx-001" \
  -d '{
    "from_wallet_id": 1,
    "to_wallet_id": 2,
    "amount": 500
  }'
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "transfer completed"
}
```

---

## License
This project is open-source under the [MIT License](LICENSE).
