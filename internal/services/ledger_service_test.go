package services_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Anant3008/payment-ledger-system/internal/config"
	"github.com/Anant3008/payment-ledger-system/internal/db"
	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/Anant3008/payment-ledger-system/internal/models"
	"github.com/Anant3008/payment-ledger-system/internal/repository"
	"github.com/Anant3008/payment-ledger-system/internal/services"
	"github.com/jmoiron/sqlx"
)

func setupServicesTestDB(t *testing.T) *sqlx.DB {
	t.Helper()
	cfg := config.Load()

	conn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		t.Skipf("Skipping integration test: database unavailable at %s: %v", cfg.DatabaseURL, err)
	}
	return conn
}

func TestLedgerService_NonExistentWallet(t *testing.T) {
	conn := setupServicesTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	ledgerRepo := repository.NewLedgerRepository(conn)
	txRepo := repository.NewTransactionRepository(conn)

	service := services.NewLedgerService(ledgerRepo, txRepo, walletRepo)
	ctx := context.Background()

	// Non-existent wallet ID
	nonExistentID := 88888888

	_, err := service.GetWalletLedger(ctx, nonExistentID, 10, 0)
	if err == nil {
		t.Fatal("expected ErrNotFound for non-existent wallet ledger, got nil")
	}
	if !errors.Is(err, apperrors.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}

	_, err = service.GetWalletTransactions(ctx, nonExistentID, 10, 0)
	if err == nil {
		t.Fatal("expected ErrNotFound for non-existent wallet transactions, got nil")
	}
	if !errors.Is(err, apperrors.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestLedgerService_PaginationAndClamping(t *testing.T) {
	conn := setupServicesTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	ledgerRepo := repository.NewLedgerRepository(conn)
	txRepo := repository.NewTransactionRepository(conn)

	service := services.NewLedgerService(ledgerRepo, txRepo, walletRepo)
	ctx := context.Background()

	w := &models.Wallet{
		Owner:   fmt.Sprintf("ServiceTest-%d", time.Now().UnixNano()),
		Balance: 1000,
	}
	if err := walletRepo.Create(ctx, w); err != nil {
		t.Fatalf("failed to create wallet: %v", err)
	}

	// Deposit 3 times
	for i := 1; i <= 3; i++ {
		_, err := walletRepo.Deposit(ctx, w.ID, int64(i*100))
		if err != nil {
			t.Fatalf("deposit failed: %v", err)
		}
	}

	// 1. Test negative offset and zero limit (must be clamped to default limit=20, offset=0)
	entries, err := service.GetWalletLedger(ctx, w.ID, 0, -5)
	if err != nil {
		t.Fatalf("failed to get ledger: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries with clamped pagination, got %d", len(entries))
	}

	// 2. Test excessive limit (limit 500 must clamp to 100 without error)
	entries, err = service.GetWalletLedger(ctx, w.ID, 500, 0)
	if err != nil {
		t.Fatalf("failed to get ledger with high limit: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}

	// 3. Transactions query
	transactions, err := service.GetWalletTransactions(ctx, w.ID, 10, 0)
	if err != nil {
		t.Fatalf("failed to get transactions: %v", err)
	}
	if len(transactions) != 3 {
		t.Fatalf("expected 3 transactions, got %d", len(transactions))
	}
}
