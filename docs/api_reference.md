Base URL: http://localhost:8080

System Routes
Health Check
GET /health

Request Headers:
None

Request Body:
None

Response: 200 OK
```json
{
  "status": "ok"
}
```

Errors:

500 - Database connection failed / Server error
```json
{
  "status": "unhealthy",
  "error": "database connection error"
}
```

---

Wallet Routes
Create Wallet
POST /wallets

Request Headers:
- Content-Type: application/json
- X-Request-ID: (optional) string

Request Body:
```json
{
  "owner": "Alice",
  "initial_balance": 1000
}
```

Response: 201 Created
```json
{
  "id": 1,
  "owner": "Alice",
  "balance": 1000,
  "created_at": "2026-09-07T12:00:00Z"
}
```

Errors:

400 - Validation error / Invalid input provided
```json
{
  "error": "invalid input provided"
}
```

500 - Server error
```json
{
  "error": "internal server error"
}
```

---

Wallet Routes
Get Wallet
GET /wallets/:id

URL Parameters:
- id: integer (required, e.g. /wallets/1)

Request Headers:
- X-Request-ID: (optional) string

Request Body:
None

Response: 200 OK
```json
{
  "id": 1,
  "owner": "Alice",
  "balance": 1000,
  "created_at": "2026-09-07T12:00:00Z"
}
```

Errors:

400 - Invalid ID format / Validation error
```json
{
  "error": "invalid input provided"
}
```

404 - Wallet not found
```json
{
  "error": "resource not found"
}
```

500 - Server error
```json
{
  "error": "internal server error"
}
```

---

Wallet Routes
Deposit Funds
POST /wallets/:id/deposit

URL Parameters:
- id: integer (required, e.g. /wallets/1/deposit)

Request Headers:
- Content-Type: application/json
- X-Request-ID: (optional) string

Request Body:
```json
{
  "amount": 500
}
```

Response: 200 OK
```json
{
  "id": 10,
  "wallet_id": 1,
  "amount": 500,
  "type": "deposit",
  "status": "completed",
  "created_at": "2026-09-15T15:00:00Z"
}
```

Errors:

400 - Validation error / Invalid or non-positive amount
```json
{
  "error": "invalid input provided"
}
```

404 - Wallet not found
```json
{
  "error": "resource not found"
}
```

500 - Server error
```json
{
  "error": "internal server error"
}
```

---

Wallet Routes
Withdraw Funds
POST /wallets/:id/withdraw

URL Parameters:
- id: integer (required, e.g. /wallets/1/withdraw)

Request Headers:
- Content-Type: application/json
- X-Request-ID: (optional) string

Request Body:
```json
{
  "amount": 200
}
```

Response: 200 OK
```json
{
  "id": 11,
  "wallet_id": 1,
  "amount": 200,
  "type": "withdrawal",
  "status": "completed",
  "created_at": "2026-09-15T15:05:00Z"
}
```

Errors:

400 - Validation error / Invalid or non-positive amount
```json
{
  "error": "invalid input provided"
}
```

400 - Insufficient funds in wallet
```json
{
  "error": "insufficient funds for transfer"
}
```

404 - Wallet not found
```json
{
  "error": "resource not found"
}
```

500 - Server error
```json
{
  "error": "internal server error"
}
```

---

Ledger Routes
Get Wallet Ledger Entries
GET /wallets/:id/ledger

URL Parameters:
- id: integer (required, e.g. /wallets/1/ledger)

Query Parameters:
- limit: integer (optional, default 20, max 100)
- offset: integer (optional, default 0)

Request Headers:
- X-Request-ID: (optional) string

Request Body:
None

Response: 200 OK
```json
{
  "wallet_id": 1,
  "limit": 20,
  "offset": 0,
  "entries": [
    {
      "id": 15,
      "transaction_id": 10,
      "wallet_id": 1,
      "amount": 500,
      "created_at": "2026-09-15T15:00:00Z"
    },
    {
      "id": 16,
      "transaction_id": 11,
      "wallet_id": 1,
      "amount": -200,
      "created_at": "2026-09-15T15:05:00Z"
    }
  ]
}
```

Errors:

400 - Invalid ID format
```json
{
  "error": "invalid input provided"
}
```

404 - Wallet not found
```json
{
  "error": "resource not found"
}
```

500 - Server error
```json
{
  "error": "internal server error"
}
```

---

Ledger Routes
Get Wallet Transactions
GET /wallets/:id/transactions

URL Parameters:
- id: integer (required, e.g. /wallets/1/transactions)

Query Parameters:
- limit: integer (optional, default 20, max 100)
- offset: integer (optional, default 0)

Request Headers:
- X-Request-ID: (optional) string

Request Body:
None

Response: 200 OK
```json
{
  "wallet_id": 1,
  "limit": 20,
  "offset": 0,
  "transactions": [
    {
      "id": 11,
      "wallet_id": 1,
      "amount": 200,
      "type": "withdrawal",
      "status": "completed",
      "created_at": "2026-09-15T15:05:00Z"
    },
    {
      "id": 10,
      "wallet_id": 1,
      "amount": 500,
      "type": "deposit",
      "status": "completed",
      "created_at": "2026-09-15T15:00:00Z"
    }
  ]
}
```

Errors:

400 - Invalid ID format
```json
{
  "error": "invalid input provided"
}
```

404 - Wallet not found
```json
{
  "error": "resource not found"
}
```

500 - Server error
```json
{
  "error": "internal server error"
}
```

---

Transfer Routes
Process Transfer
POST /transfers

Request Headers:
- Content-Type: application/json
- X-Request-ID: (optional) string

Request Body:
```json
{
  "from_wallet_id": 1,
  "to_wallet_id": 2,
  "amount": 250
}
```

Response: 200 OK
```json
{
  "status": "success",
  "message": "transfer completed"
}
```

Errors:

400 - Validation error / Same-wallet transfer / Negative or zero amount
```json
{
  "error": "invalid input provided"
}
```

400 - Insufficient funds in sender wallet
```json
{
  "error": "insufficient funds for transfer"
}
```

404 - Sender or recipient wallet not found
```json
{
  "error": "resource not found"
}
```

500 - Server error
```json
{
  "error": "internal server error"
}
```
