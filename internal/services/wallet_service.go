package services

import (
	"context"
	"errors"

	"github.com/Anant3008/payment-ledger-system/internal/models"
	"github.com/Anant3008/payment-ledger-system/internal/repository"
)

type WalletService struct {
	repo *repository.WalletRepository
}

func NewWalletService(repo *repository.WalletRepository) *WalletService {
	return &WalletService{repo: repo}
}

// CreateWallet validates and creates a new wallet.
func (s *WalletService) CreateWallet(ctx context.Context, owner string, initialBalance int64) (*models.Wallet, error) {
	if initialBalance < 0 {
		return nil, errors.New("initial balance cannot be negative")
	}
	w := &models.Wallet{
		Owner:   owner,
		Balance: initialBalance,
	}
	if err := s.repo.Create(ctx, w); err != nil {
		return nil, err
	}
	return w, nil
}

// GetWallet retrieves a wallet by its ID.
func (s *WalletService) GetWallet(ctx context.Context, id int) (*models.Wallet, error) {
	return s.repo.GetByID(ctx, id)
}
