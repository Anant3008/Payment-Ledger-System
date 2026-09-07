# Payment Ledger System

A high-concurrency, transactional payment ledger service built in Go. Implements double-entry bookkeeping, ACID-compliant money transfers, row-level pessimistic locking to prevent race conditions and deadlocks, and centralized error handling with structured tracing.

---

## Key Features

- **Double-Entry Bookkeeping:** Every financial transfer creates balanced debit and credit entries attached to an immutable transaction record for full auditability.
- **Concurrency & Deadlock Prevention:** Uses atomic database transactions (`sqlx.Tx`) and pessimistic row-level locking (`SELECT ... FOR UPDATE`). Rows are locked in deterministic ascending order by `wallet_id` to eliminate deadlock hazards during concurrent transfers.
- **Decoupled Architecture:** Strict separation of concerns adhering to the Controller (Handler) → Service → Repository pattern.
- **Centralized Error Handling:** Domain sentinel errors (`ErrNotFound`, `ErrInsufficientFunds`, `ErrInvalidInput`, `ErrConflict`) mapped through centralized middleware to safe HTTP status codes without leaking internal database errors.
- **Structured Logging & Tracing:** Go standard library `log/slog` JSON logging with `X-Request-ID` header propagation for distributed request correlation.

---

## Tech Stack

- **Language:** Go (1.22+)
- **HTTP Framework:** [Gin](https://github.com/gin-gonic/gin)
- **Database:** PostgreSQL 15
- **Driver & Query Library:** [pgx/v5](https://github.com/jackc/pgx) & [sqlx](https://github.com/jmoiron/sqlx)
- **Migrations:** [golang-migrate](https://github.com/golang-migrate/migrate)
- **Containerization:** Docker & Docker Compose

---

## Project Structure

```text
├── cmd/
│   └── server/
│       └── main.go               # Application entrypoint & dependency wiring
├── internal/
│   ├── config/                   # Environment variable parsing
│   ├── db/                       # Database connection initialization
│   ├── errors/                   # Domain sentinel error definitions
│   ├── handlers/                 # HTTP transport layer & middleware
│   ├── models/                   # Domain entities (Wallet, Transaction, LedgerEntry)
│   ├── repository/               # Database operations & SQL transactions
│   └── services/                 # Core business rules & validation logic
├── migrations/                   # SQL migration scripts
├── docker-compose.yml            # Local PostgreSQL and application setup
├── Makefile                      # Migration management targets
└── README.MD
```

---

## Getting Started

### Prerequisites

- Go 1.22 or higher
- Docker & Docker Compose
- `make` (optional, for running migration commands)
- `golang-migrate` CLI (optional, if running migrations outside Docker)

### 1. Start the Database

Start the PostgreSQL container using Docker Compose:

```bash
docker-compose up -d db
```

### 2. Run Database Migrations

Apply the database schema migrations:

```bash
make migrate-up
```

*(Alternatively, apply the SQL files in `migrations/` directly against your PostgreSQL instance.)*

### 3. Configure Environment

The application reads configuration from environment variables or a local `.env` file:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/payment_ledger?sslmode=disable` |
| `PORT` | Server listening port | `8080` |

### 4. Run the Server

```bash
go run ./cmd/server
```

The server will start on `http://localhost:8080`.

---

## API Reference

> Dedicated route documentation is available in [`docs/api_reference.md`](./docs/api_reference.md).

### Health Check

#### `GET /health`
Checks database connectivity and server readiness.

```bash
curl -X GET http://localhost:8080/health
```

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

---

### Wallets

#### `POST /wallets`
Creates a new wallet account with an optional initial balance.

```bash
curl -X POST http://localhost:8080/wallets \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "Alice",
    "initial_balance": 1000
  }'
```

**Response (201 Created):**
```json
{
  "id": 1,
  "owner": "Alice",
  "balance": 1000,
  "created_at": "2026-09-07T12:00:00Z"
}
```

#### `GET /wallets/:id`
Retrieves a wallet by its ID.

```bash
curl -X GET http://localhost:8080/wallets/1
```

**Response (200 OK):**
```json
{
  "id": 1,
  "owner": "Alice",
  "balance": 1000,
  "created_at": "2026-09-07T12:00:00Z"
}
```

---

### Transfers

#### `POST /transfers`
Executes an atomic money transfer between two wallets. Creates parent transaction and corresponding double-entry ledger records.

```bash
curl -X POST http://localhost:8080/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "from_wallet_id": 1,
    "to_wallet_id": 2,
    "amount": 250
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

## Error Handling & Status Codes

All errors are handled through centralized middleware returning a standardized JSON error format:

```json
{
  "error": "insufficient funds for transfer"
}
```

| HTTP Status | Trigger |
|---|---|
| `400 Bad Request` | Invalid JSON, negative amounts, self-transfers, insufficient funds |
| `404 Not Found` | Wallet ID does not exist |
| `409 Conflict` | State or resource conflict |
| `500 Internal Server Error` | Unexpected server or database errors (internal details masked from client) |

Each request receives an `X-Request-ID` response header used to trace corresponding internal error logs via `log/slog`.

---

## Running Tests

Run the test suite:

```bash
go test -v ./...
```
