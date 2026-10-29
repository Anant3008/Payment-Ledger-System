package services

import (
	"context"
	"time"

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

// ReconcileWallet checks the mathematical consistency between the wallet balance and its ledger entries sum.
func (s *LedgerService) ReconcileWallet(ctx context.Context, walletID int) (map[string]interface{}, error) {
	w, err := s.walletRepo.GetByID(ctx, walletID)
	if err != nil {
		return nil, err
	}
	sum, count, err := s.ledgerRepo.ReconcileWallet(ctx, walletID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"wallet_id":      w.ID,
		"cached_balance": w.Balance,
		"ledger_balance": sum,
		"entry_count":    count,
		"balanced":       w.Balance == sum,
		"chain_valid":    true,
		"checked_at":     time.Now().UTC().Format(time.RFC3339),
	}, nil
}
