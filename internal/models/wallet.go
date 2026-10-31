package models

import "time"

// Wallet represents a user's wallet with a balance in smallest currency unit (e.g., cents).
type Wallet struct {
    ID        int       `db:"id" json:"id"`
    Owner     string    `db:"owner" json:"owner"`
    Balance   int64     `db:"balance" json:"balance"`
    CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// WalletReconciliation represents an atomic MVCC snapshot check of a wallet against its ledger.
type WalletReconciliation struct {
    WalletID      int   `db:"wallet_id" json:"wallet_id"`
    CachedBalance int64 `db:"cached_balance" json:"cached_balance"`
    LedgerBalance int64 `db:"ledger_balance" json:"ledger_balance"`
    EntryCount    int   `db:"entry_count" json:"entry_count"`
}
