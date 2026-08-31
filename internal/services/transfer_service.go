package services

import (
	"context"
	"errors"

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
		return errors.New("transfer amount must be greater than zero")
	}
	if fromWalletID == toWalletID {
		return errors.New("cannot transfer to the same wallet")
	}

	return s.transferRepo.ExecuteTransfer(ctx, fromWalletID, toWalletID, amount)
}
