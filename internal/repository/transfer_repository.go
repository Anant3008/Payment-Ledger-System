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

// ExecuteTransfer handles atomic fund movement in a single database round-trip
// via the process_transfer stored procedure.
func (r *TransferRepository) ExecuteTransfer(ctx context.Context, fromWalletID, toWalletID int, amount int64) error {
	var txID int
	err := r.db.QueryRowxContext(ctx, "SELECT process_transfer($1, $2, $3)", fromWalletID, toWalletID, amount).Scan(&txID)
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

		return fmt.Errorf("process transfer: %w", err)
	}

	return nil
}

