package models

import "time"

// LedgerEntry represents an entry in the ledger associated with a transaction.
type LedgerEntry struct {
    ID            int       `db:"id" json:"id"`
    TransactionID int       `db:"transaction_id" json:"transaction_id"`
    WalletID      int       `db:"wallet_id" json:"wallet_id"`
    Amount        int64     `db:"amount" json:"amount"`
    CreatedAt     time.Time `db:"created_at" json:"created_at"`
}
