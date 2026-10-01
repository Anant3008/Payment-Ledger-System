# Payment Ledger API Reference

Base URL: `http://localhost:8080`

---

## Global Headers

### Mutating Endpoints (POST)
All mutating requests (`POST /wallets`, `POST /wallets/:id/deposit`, `POST /wallets/:id/withdraw`, `POST /transfers`) require an idempotency key to prevent accidental duplicate operations caused by client retries or network drops.

| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Idempotency-Key` | String | **Yes** | Unique identifier (e.g. UUID v4) representing this mutation request. Re-sent keys return the cached response. |
| `Content-Type` | String | **Yes** | Must be `application/json`. |
| `X-Request-ID` | String | No | Optional client request correlation ID. If omitted, the server generates a unique UUID. |

### Read-Only Endpoints (GET)
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `X-Request-ID` | String | No | Optional client request correlation ID. |

---

## Error Handling & Status Codes

All errors adhere to a standardized JSON schema:

```json
{
  "error": "human-readable error message"
}
```

| HTTP Status | Reason | Example Error Message |
| :---: | :--- | :--- |
| `400 Bad Request` | Missing required fields, invalid types, negative amounts, or insufficient funds. | `"invalid input provided"` or `"insufficient funds for transfer"` |
| `404 Not Found` | Requested wallet or resource does not exist. | `"resource not found"` |
| `409 Conflict` | Concurrent request with the exact same `Idempotency-Key` is currently in progress. | `"request already in progress"` |
| `500 Internal Server Error` | Database or unhandled system error. Internal errors are masked to prevent data leaks. | `"internal server error"` |

---

## Endpoints

### 1. System Health

#### `GET /health`
Checks database connectivity and application readiness.

**Request:**
```bash
curl -X GET http://localhost:8080/health
```

**Response: `200 OK`**
```json
{
  "status": "ok"
}
```

**Errors:**
- `500 Internal Server Error`: Database unreachable.
  ```json
  {
    "status": "unhealthy",
    "error": "database ping error"
  }
  ```

---

### 2. Wallets

#### `POST /wallets`
Creates a new wallet. If `initial_balance` is greater than 0, an initial deposit transaction and corresponding ledger credit entry are atomically created in the same database transaction.

**Request:**
```bash
curl -X POST http://localhost:8080/wallets \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" \
  -d '{
    "owner": "Alice",
    "initial_balance": 1000
  }'
```

**Response: `201 Created`**
```json
{
  "id": 1,
  "owner": "Alice",
  "balance": 1000,
  "created_at": "2026-10-01T12:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: Missing `owner` field or negative `initial_balance`.
- `400 Bad Request`: Missing `Idempotency-Key` header.
- `409 Conflict`: Identical idempotency key is actively being processed.

---

#### `GET /wallets/:id`
Retrieves account information and current balance for a specified wallet.

**Parameters:**
- `id` (integer, required): Wallet identifier.

**Request:**
```bash
curl -X GET http://localhost:8080/wallets/1
```

**Response: `200 OK`**
```json
{
  "id": 1,
  "owner": "Alice",
  "balance": 1000,
  "created_at": "2026-10-01T12:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: `id` is not a valid integer.
- `404 Not Found`: Wallet does not exist.

---

#### `POST /wallets/:id/deposit`
Deposits funds into a wallet. Atomically increases the balance, inserts a `transactions` record (`type: "deposit"`), and creates a positive credit in `ledger_entries`.

**Parameters:**
- `id` (integer, required): Target wallet identifier.

**Request:**
```bash
curl -X POST http://localhost:8080/wallets/1/deposit \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: deposit-alice-001" \
  -d '{
    "amount": 500
  }'
```

**Response: `200 OK`**
```json
{
  "id": 10,
  "wallet_id": 1,
  "amount": 500,
  "type": "deposit",
  "status": "completed",
  "created_at": "2026-10-01T12:05:00Z"
}
```

**Errors:**
- `400 Bad Request`: `amount` is zero or negative.
- `404 Not Found`: Wallet does not exist.

---

#### `POST /wallets/:id/withdraw`
Withdraws funds from a wallet. Atomically decreases the balance, verifies the wallet does not overdraft, inserts a `transactions` record (`type: "withdrawal"`), and creates a negative debit in `ledger_entries`.

**Parameters:**
- `id` (integer, required): Target wallet identifier.

**Request:**
```bash
curl -X POST http://localhost:8080/wallets/1/withdraw \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: withdraw-alice-001" \
  -d '{
    "amount": 200
  }'
```

**Response: `200 OK`**
```json
{
  "id": 11,
  "wallet_id": 1,
  "amount": 200,
  "type": "withdrawal",
  "status": "completed",
  "created_at": "2026-10-01T12:10:00Z"
}
```

**Errors:**
- `400 Bad Request`: `amount` is zero or negative.
- `400 Bad Request`: `insufficient funds for transfer` (wallet balance is less than requested amount).
- `404 Not Found`: Wallet does not exist.

---

### 3. Money Transfers

#### `POST /transfers`
Executes an atomic double-entry transfer between two distinct wallets. 

Transfers are queued through the in-memory micro-batching engine, grouped into atomic batches, and executed via PostgreSQL with deterministic row locking (`min(from, to)` then `max(from, to)`).

**Request:**
```bash
curl -X POST http://localhost:8080/transfers \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: transfer-tx-994" \
  -d '{
    "from_wallet_id": 1,
    "to_wallet_id": 2,
    "amount": 350
  }'
```

**Response: `200 OK`**
```json
{
  "status": "success",
  "message": "transfer completed"
}
```

**Errors:**
- `400 Bad Request`: Missing fields or `amount <= 0`.
- `400 Bad Request`: `cannot transfer to self` (`from_wallet_id == to_wallet_id`).
- `400 Bad Request`: `insufficient funds for transfer` (sender balance is lower than `amount`).
- `404 Not Found`: Either sender or recipient wallet does not exist.
- `409 Conflict`: Duplicate transfer request with the same idempotency key is currently executing.

---

### 4. Ledger & History

#### `GET /wallets/:id/ledger`
Returns the immutable, chronological double-entry accounting records for a wallet.

**Parameters:**
- `id` (integer, required): Wallet identifier.

**Query Parameters:**
| Parameter | Type | Default | Constraints | Description |
| :--- | :--- | :---: | :--- | :--- |
| `limit` | Integer | `20` | Max `100` | Number of records to return. |
| `offset` | Integer | `0` | Min `0` | Number of records to skip. |

**Request:**
```bash
curl -X GET "http://localhost:8080/wallets/1/ledger?limit=10&offset=0"
```

**Response: `200 OK`**
```json
{
  "wallet_id": 1,
  "limit": 10,
  "offset": 0,
  "entries": [
    {
      "id": 102,
      "transaction_id": 45,
      "wallet_id": 1,
      "amount": -350,
      "created_at": "2026-10-01T12:15:00Z"
    },
    {
      "id": 85,
      "transaction_id": 11,
      "wallet_id": 1,
      "amount": -200,
      "created_at": "2026-10-01T12:10:00Z"
    },
    {
      "id": 84,
      "transaction_id": 10,
      "wallet_id": 1,
      "amount": 500,
      "created_at": "2026-10-01T12:05:00Z"
    },
    {
      "id": 1,
      "transaction_id": 1,
      "wallet_id": 1,
      "amount": 1000,
      "created_at": "2026-10-01T12:00:00Z"
    }
  ]
}
```

---

#### `GET /wallets/:id/transactions`
Returns high-level transaction history for a wallet.

**Parameters:**
- `id` (integer, required): Wallet identifier.

**Query Parameters:**
| Parameter | Type | Default | Constraints | Description |
| :--- | :--- | :---: | :--- | :--- |
| `limit` | Integer | `20` | Max `100` | Number of records to return. |
| `offset` | Integer | `0` | Min `0` | Number of records to skip. |

**Request:**
```bash
curl -X GET "http://localhost:8080/wallets/1/transactions?limit=10&offset=0"
```

**Response: `200 OK`**
```json
{
  "wallet_id": 1,
  "limit": 10,
  "offset": 0,
  "transactions": [
    {
      "id": 45,
      "wallet_id": 1,
      "amount": 350,
      "type": "transfer",
      "status": "completed",
      "created_at": "2026-10-01T12:15:00Z"
    },
    {
      "id": 11,
      "wallet_id": 1,
      "amount": 200,
      "type": "withdrawal",
      "status": "completed",
      "created_at": "2026-10-01T12:10:00Z"
    },
    {
      "id": 10,
      "wallet_id": 1,
      "amount": 500,
      "type": "deposit",
      "status": "completed",
      "created_at": "2026-10-01T12:05:00Z"
    },
    {
      "id": 1,
      "wallet_id": 1,
      "amount": 1000,
      "type": "deposit",
      "status": "completed",
      "created_at": "2026-10-01T12:00:00Z"
    }
  ]
}
```
