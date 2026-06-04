package repository

import (
    "context"

    "github.com/jmoiron/sqlx"
    "github.com/Anant3008/payment-ledger-system/internal/models"
)

type TransactionRepository struct{ db *sqlx.DB }

func NewTransactionRepository(db *sqlx.DB) *TransactionRepository { return &TransactionRepository{db: db} }

func (r *TransactionRepository) Create(ctx context.Context, t *models.Transaction) error {
    query := `INSERT INTO transactions (wallet_id, amount, type, status) VALUES ($1, $2, $3, $4) RETURNING id, created_at`
    return r.db.QueryRowxContext(ctx, query, t.WalletID, t.Amount, t.Type, t.Status).Scan(&t.ID, &t.CreatedAt)
}

func (r *TransactionRepository) GetByID(ctx context.Context, id int) (*models.Transaction, error) {
    var t models.Transaction
    if err := r.db.GetContext(ctx, &t, "SELECT id, wallet_id, amount, type, status, created_at FROM transactions WHERE id=$1", id); err != nil {
        return nil, err
    }
    return &t, nil
}

func (r *TransactionRepository) ListByWallet(ctx context.Context, walletID int) ([]models.Transaction, error) {
    var out []models.Transaction
    err := r.db.SelectContext(ctx, &out, "SELECT id, wallet_id, amount, type, status, created_at FROM transactions WHERE wallet_id=$1 ORDER BY id", walletID)
    return out, err
}

func (r *TransactionRepository) UpdateStatus(ctx context.Context, id int, status string) error {
    _, err := r.db.ExecContext(ctx, "UPDATE transactions SET status=$1 WHERE id=$2", status, id)
    return err
}
