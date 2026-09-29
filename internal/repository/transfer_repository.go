package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jmoiron/sqlx"
)

type TransferRepository struct {
	db *sqlx.DB
}

func NewTransferRepository(db *sqlx.DB) *TransferRepository {
	return &TransferRepository{db: db}
}

// ExecuteBatch handles atomic fund movement for multiple transfers in a single database round-trip
// via the process_transfer_batch stored procedure.
func (r *TransferRepository) ExecuteBatch(ctx context.Context, fromWalletIDs, toWalletIDs []int, amounts []int64) error {
	if len(fromWalletIDs) == 0 {
		return nil
	}

	_, err := r.db.ExecContext(ctx, "SELECT process_transfer_batch($1, $2, $3)", fromWalletIDs, toWalletIDs, amounts)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "P0001":
				return fmt.Errorf("%s: %w", pgErr.Message, apperrors.ErrInsufficientFunds)
			case "P0002":
				return fmt.Errorf("%s: %w", pgErr.Message, apperrors.ErrNotFound)
			case "22023":
				return fmt.Errorf("%s: %w", pgErr.Message, apperrors.ErrInvalidInput)
			}
		}

		msg := err.Error()
		if strings.Contains(msg, "insufficient funds") {
			return fmt.Errorf("%s: %w", msg, apperrors.ErrInsufficientFunds)
		}
		if strings.Contains(msg, "resource not found") {
			return fmt.Errorf("%s: %w", msg, apperrors.ErrNotFound)
		}
		if strings.Contains(msg, "cannot transfer to self") || strings.Contains(msg, "amount must be greater than zero") {
			return fmt.Errorf("%s: %w", msg, apperrors.ErrInvalidInput)
		}

		return fmt.Errorf("process transfer batch: %w", err)
	}

	return nil
}

// ExecuteTransfer handles a single transfer request by passing it through the batching layer as an array of length 1.
func (r *TransferRepository) ExecuteTransfer(ctx context.Context, fromWalletID, toWalletID int, amount int64) error {
	return r.ExecuteBatch(ctx, []int{fromWalletID}, []int{toWalletID}, []int64{amount})
}
