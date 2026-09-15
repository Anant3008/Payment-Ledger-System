package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/Anant3008/payment-ledger-system/internal/models"
	"github.com/jmoiron/sqlx"
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
        if err == sql.ErrNoRows {
            return nil, fmt.Errorf("wallet %d: %w", id, errors.ErrNotFound)
        }
        return nil, fmt.Errorf("db get wallet: %w", err)
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

// Deposit adds funds to a wallet, recording a transaction and ledger entry atomically.
func (r *WalletRepository) Deposit(ctx context.Context, walletID int, amount int64) (*models.Transaction, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	var dummy int
	if err := tx.GetContext(ctx, &dummy, "SELECT id FROM wallets WHERE id=$1 FOR UPDATE", walletID); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("wallet %d: %w", walletID, errors.ErrNotFound)
		}
		return nil, fmt.Errorf("lock wallet: %w", err)
	}

	if _, err := tx.ExecContext(ctx, "UPDATE wallets SET balance = balance + $1 WHERE id = $2", amount, walletID); err != nil {
		return nil, fmt.Errorf("update balance: %w", err)
	}

	var transaction models.Transaction
	queryTx := `INSERT INTO transactions (wallet_id, amount, type, status) VALUES ($1, $2, 'deposit', 'completed') RETURNING id, wallet_id, amount, type, status, created_at`
	if err := tx.QueryRowxContext(ctx, queryTx, walletID, amount).StructScan(&transaction); err != nil {
		return nil, fmt.Errorf("insert transaction: %w", err)
	}

	queryLedger := `INSERT INTO ledger_entries (transaction_id, wallet_id, amount) VALUES ($1, $2, $3)`
	if _, err := tx.ExecContext(ctx, queryLedger, transaction.ID, walletID, amount); err != nil {
		return nil, fmt.Errorf("insert ledger entry: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return &transaction, nil
}

// Withdraw deducts funds from a wallet, recording a transaction and ledger entry atomically.
func (r *WalletRepository) Withdraw(ctx context.Context, walletID int, amount int64) (*models.Transaction, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	var currentBalance int64
	if err := tx.GetContext(ctx, &currentBalance, "SELECT balance FROM wallets WHERE id=$1 FOR UPDATE", walletID); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("wallet %d: %w", walletID, errors.ErrNotFound)
		}
		return nil, fmt.Errorf("lock wallet: %w", err)
	}

	if currentBalance < amount {
		return nil, fmt.Errorf("balance %d < amount %d: %w", currentBalance, amount, errors.ErrInsufficientFunds)
	}

	if _, err := tx.ExecContext(ctx, "UPDATE wallets SET balance = balance - $1 WHERE id = $2", amount, walletID); err != nil {
		return nil, fmt.Errorf("update balance: %w", err)
	}

	var transaction models.Transaction
	queryTx := `INSERT INTO transactions (wallet_id, amount, type, status) VALUES ($1, $2, 'withdrawal', 'completed') RETURNING id, wallet_id, amount, type, status, created_at`
	if err := tx.QueryRowxContext(ctx, queryTx, walletID, amount).StructScan(&transaction); err != nil {
		return nil, fmt.Errorf("insert transaction: %w", err)
	}

	queryLedger := `INSERT INTO ledger_entries (transaction_id, wallet_id, amount) VALUES ($1, $2, $3)`
	if _, err := tx.ExecContext(ctx, queryLedger, transaction.ID, walletID, -amount); err != nil {
		return nil, fmt.Errorf("insert ledger entry: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return &transaction, nil
}
