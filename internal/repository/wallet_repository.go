package repository

import (
    "context"

    "github.com/jmoiron/sqlx"
    "github.com/Anant3008/payment-ledger-system/internal/models"
)

type WalletRepository struct {
    db *sqlx.DB
}

func NewWalletRepository(db *sqlx.DB) *WalletRepository { return &WalletRepository{db: db} }

func (r *WalletRepository) Create(ctx context.Context, w *models.Wallet) error {
    query := `INSERT INTO wallets (owner, balance) VALUES ($1, $2) RETURNING id, created_at`
    return r.db.QueryRowxContext(ctx, query, w.Owner, w.Balance).Scan(&w.ID, &w.CreatedAt)
}

func (r *WalletRepository) GetByID(ctx context.Context, id int) (*models.Wallet, error) {
    var w models.Wallet
    if err := r.db.GetContext(ctx, &w, "SELECT id, owner, balance, created_at FROM wallets WHERE id=$1", id); err != nil {
        return nil, err
    }
    return &w, nil
}

func (r *WalletRepository) UpdateBalance(ctx context.Context, id int, newBalance int64) error {
    _, err := r.db.ExecContext(ctx, "UPDATE wallets SET balance=$1 WHERE id=$2", newBalance, id)
    return err
}

func (r *WalletRepository) List(ctx context.Context) ([]models.Wallet, error) {
    var out []models.Wallet
    err := r.db.SelectContext(ctx, &out, "SELECT id, owner, balance, created_at FROM wallets ORDER BY id")
    return out, err
}
