# Benchmark Environment & System Specifications

This document records the exact hardware, operating system, runtime, database, and connection pool configuration used to capture the baseline benchmark metrics for the Payment Ledger System.

---

## 1. Host Hardware & OS

| Component | Specification |
|---|---|
| **CPU Model** | 12th Gen Intel(R) Core(TM) i7-1255U |
| **CPU Cores / Threads** | 12 vCPUs (2 Performance cores with Hyper-Threading + 8 Efficient cores) |
| **Memory (RAM)** | 15.0 GiB physical memory |
| **Operating System** | Fedora Linux (x86_64) |
| **Kernel Version** | `7.2.6-100.fc43.x86_64` |

---

## 2. Runtimes & Container Tooling

| Software | Version | Notes |
|---|---|---|
| **Docker Engine** | `29.6.2` (build 1.fc43) | Host container runtime |
| **Docker Compose** | `v2.x` | Orchestrating `db`, `app`, and `audit-worker` |
| **k6 Load Generator** | `v2.3.0` (commit `e088784614`) | High-concurrency load testing engine |
| **Go Runtime** | `go1.26.3-alpine` (builder) / `go1.26.8` (host) | Application compiled with CGO_ENABLED=0 |
| **PostgreSQL** | `15.19` (Debian 15.19-1.pgdg13+2) | Default transaction isolation: `Read Committed` |

---

## 3. Database Connection Pool & Application Settings

The Go application configures its database connection pool in `internal/db/postgres.go`:

```go
db.SetMaxOpenConns(10)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

### Architectural Implications for Load Testing
* **MaxOpenConns (10):** Under high concurrency (50, 100, 250, 500 VUs), Gin handles incoming requests concurrently, but threads queuing for a PostgreSQL connection block in Go's `database/sql` driver connection pool queue.
* **Row-Level Locking:** Transactions use `SELECT ... FOR UPDATE` with deterministic ascending ID ordering (`MIN(A, B)` then `MAX(A, B)`).
* **Idempotency Overhead:** Each mutating request executes an atomic `TryLock` query against the `idempotency_keys` table, followed by response caching upon transaction commit.
