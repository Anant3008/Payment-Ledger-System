package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"
)

type TransferRepository struct {
	db *sqlx.DB
}

func NewTransferRepository(db *sqlx.DB) *TransferRepository {
	return &TransferRepository{db: db}
}

// ExecuteTransfer handles the atomic database operations for moving funds.
func (r *TransferRepository) ExecuteTransfer(ctx context.Context, fromWalletID, toWalletID int, amount int64) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Lock wallets in consistent order to prevent deadlocks
	firstID, secondID := fromWalletID, toWalletID
	if firstID > secondID {
		firstID, secondID = secondID, firstID
	}

	var dummy int
	if err := tx.GetContext(ctx, &dummy, "SELECT id FROM wallets WHERE id=$1 FOR UPDATE", firstID); err != nil {
		return fmt.Errorf("lock wallet %d: %w", firstID, err)
	}
	if err := tx.GetContext(ctx, &dummy, "SELECT id FROM wallets WHERE id=$1 FOR UPDATE", secondID); err != nil {
		return fmt.Errorf("lock wallet %d: %w", secondID, err)
	}

	// Check sender balance
	var senderBalance int64
	if err := tx.GetContext(ctx, &senderBalance, "SELECT balance FROM wallets WHERE id=$1", fromWalletID); err != nil {
		return fmt.Errorf("get sender balance: %w", err)
	}
	if senderBalance < amount {
		return errors.New("insufficient funds")
	}

	// Update balances
	if _, err := tx.ExecContext(ctx, "UPDATE wallets SET balance = balance - $1 WHERE id = $2", amount, fromWalletID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE wallets SET balance = balance + $1 WHERE id = $2", amount, toWalletID); err != nil {
		return err
	}

	// Record transaction
	var txID int
	err = tx.QueryRowxContext(ctx,
		`INSERT INTO transactions (wallet_id, amount, type, status) VALUES ($1, $2, $3, $4) RETURNING id`,
		fromWalletID, amount, "transfer", "completed",
	).Scan(&txID)
	if err != nil {
		return err
	}

	// Record ledger entries
	_, err = tx.ExecContext(ctx,
		`INSERT INTO ledger_entries (transaction_id, wallet_id, amount) VALUES ($1, $2, $3), ($1, $4, $5)`,
		txID, fromWalletID, -amount, toWalletID, amount,
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}
