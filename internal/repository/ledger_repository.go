package repository

import (
    "context"

    "github.com/jmoiron/sqlx"
    "github.com/Anant3008/payment-ledger-system/internal/models"
)

type LedgerRepository struct{ db *sqlx.DB }

func NewLedgerRepository(db *sqlx.DB) *LedgerRepository { return &LedgerRepository{db: db} }

func (r *LedgerRepository) CreateEntry(ctx context.Context, e *models.LedgerEntry) error {
    query := `INSERT INTO ledger_entries (transaction_id, wallet_id, amount) VALUES ($1, $2, $3) RETURNING id, created_at`
    return r.db.QueryRowxContext(ctx, query, e.TransactionID, e.WalletID, e.Amount).Scan(&e.ID, &e.CreatedAt)
}

func (r *LedgerRepository) ListByWallet(ctx context.Context, walletID int, limit, offset int) ([]models.LedgerEntry, error) {
    if limit <= 0 {
        limit = 20
    }
    if offset < 0 {
        offset = 0
    }
    out := []models.LedgerEntry{}
    err := r.db.SelectContext(ctx, &out, "SELECT id, transaction_id, wallet_id, amount, created_at FROM ledger_entries WHERE wallet_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3", walletID, limit, offset)
    return out, err
}

func (r *LedgerRepository) ListByTransaction(ctx context.Context, txID int) ([]models.LedgerEntry, error) {
    var out []models.LedgerEntry
    err := r.db.SelectContext(ctx, &out, "SELECT id, transaction_id, wallet_id, amount, created_at FROM ledger_entries WHERE transaction_id=$1 ORDER BY id", txID)
    return out, err
}
