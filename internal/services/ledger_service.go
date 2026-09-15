package services

import (
	"context"

	"github.com/Anant3008/payment-ledger-system/internal/models"
	"github.com/Anant3008/payment-ledger-system/internal/repository"
)

type LedgerService struct {
	ledgerRepo      *repository.LedgerRepository
	transactionRepo *repository.TransactionRepository
	walletRepo      *repository.WalletRepository
}

func NewLedgerService(
	ledgerRepo *repository.LedgerRepository,
	transactionRepo *repository.TransactionRepository,
	walletRepo *repository.WalletRepository,
) *LedgerService {
	return &LedgerService{
		ledgerRepo:      ledgerRepo,
		transactionRepo: transactionRepo,
		walletRepo:      walletRepo,
	}
}

// GetWalletLedger retrieves ledger entries for a wallet after verifying wallet existence.
func (s *LedgerService) GetWalletLedger(ctx context.Context, walletID int, limit, offset int) ([]models.LedgerEntry, error) {
	if _, err := s.walletRepo.GetByID(ctx, walletID); err != nil {
		return nil, err
	}

	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	return s.ledgerRepo.ListByWallet(ctx, walletID, limit, offset)
}

// GetWalletTransactions retrieves transactions for a wallet after verifying wallet existence.
func (s *LedgerService) GetWalletTransactions(ctx context.Context, walletID int, limit, offset int) ([]models.Transaction, error) {
	if _, err := s.walletRepo.GetByID(ctx, walletID); err != nil {
		return nil, err
	}

	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	return s.transactionRepo.ListByWallet(ctx, walletID, limit, offset)
}
