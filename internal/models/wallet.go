package models

import "time"

// Wallet represents a user's wallet with a balance in smallest currency unit (e.g., cents).
type Wallet struct {
    ID        int       `db:"id" json:"id"`
    Owner     string    `db:"owner" json:"owner"`
    Balance   int64     `db:"balance" json:"balance"`
    CreatedAt time.Time `db:"created_at" json:"created_at"`
}
