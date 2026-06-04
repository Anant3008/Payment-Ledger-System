package models

import "time"

// Transaction represents a transfer or payment event tied to a wallet.
type Transaction struct {
    ID        int       `db:"id" json:"id"`
    WalletID  int       `db:"wallet_id" json:"wallet_id"`
    Amount    int64     `db:"amount" json:"amount"`
    Type      string    `db:"type" json:"type"`
    Status    string    `db:"status" json:"status"`
    CreatedAt time.Time `db:"created_at" json:"created_at"`
}
