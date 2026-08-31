package services

import (
	"context"
	"fmt"

	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/Anant3008/payment-ledger-system/internal/repository"
)

type TransferService struct {
	transferRepo *repository.TransferRepository
}

func NewTransferService(transferRepo *repository.TransferRepository) *TransferService {
	return &TransferService{transferRepo: transferRepo}
}

// ProcessTransfer validates business rules before passing to the repository for atomic execution.
func (s *TransferService) ProcessTransfer(ctx context.Context, fromWalletID, toWalletID int, amount int64) error {
	if amount <= 0 {
		return fmt.Errorf("amount must be greater than zero: %w", apperrors.ErrInvalidInput)
	}
	if fromWalletID == toWalletID {
		return fmt.Errorf("cannot transfer to self: %w", apperrors.ErrInvalidInput)
	}

	return s.transferRepo.ExecuteTransfer(ctx, fromWalletID, toWalletID, amount)
}
