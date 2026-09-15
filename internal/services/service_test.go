package services_test

import (
	"context"
	"errors"
	"testing"

	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/Anant3008/payment-ledger-system/internal/repository"
	"github.com/Anant3008/payment-ledger-system/internal/services"
)

func TestWalletService_CreateWallet_NegativeBalance(t *testing.T) {
	// We can test validation purely by calling CreateWallet with nil repo.
	// Since validation fails first, it shouldn't dereference the repo.
	service := services.NewWalletService(nil)

	_, err := service.CreateWallet(context.Background(), "Alice", -10)

	if err == nil {
		t.Fatal("expected error for negative balance, got nil")
	}

	if !errors.Is(err, apperrors.ErrInvalidInput) {
		t.Fatalf("expected error to wrap ErrInvalidInput, got %v", err)
	}
}

func TestTransferService_ProcessTransfer_InvalidInputs(t *testing.T) {
	service := services.NewTransferService(nil)

	err := service.ProcessTransfer(context.Background(), 1, 2, 0)
	if !errors.Is(err, apperrors.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for zero amount, got %v", err)
	}

	err = service.ProcessTransfer(context.Background(), 1, 1, 500)
	if !errors.Is(err, apperrors.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for same-wallet transfer, got %v", err)
	}
}

func TestWalletService_Deposit_InvalidAmount(t *testing.T) {
	service := services.NewWalletService(nil)

	_, err := service.Deposit(context.Background(), 1, 0)
	if !errors.Is(err, apperrors.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for zero deposit, got %v", err)
	}

	_, err = service.Deposit(context.Background(), 1, -100)
	if !errors.Is(err, apperrors.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for negative deposit, got %v", err)
	}
}

func TestWalletService_Withdraw_InvalidAmount(t *testing.T) {
	service := services.NewWalletService(nil)

	_, err := service.Withdraw(context.Background(), 1, 0)
	if !errors.Is(err, apperrors.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for zero withdrawal, got %v", err)
	}

	_, err = service.Withdraw(context.Background(), 1, -50)
	if !errors.Is(err, apperrors.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for negative withdrawal, got %v", err)
	}
}

func TestWalletAndTransferService_Integration(t *testing.T) {
	conn := setupServicesTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	transferRepo := repository.NewTransferRepository(conn)

	walletService := services.NewWalletService(walletRepo)
	transferService := services.NewTransferService(transferRepo)
	ctx := context.Background()

	// 1. Create Wallet via Service
	alice, err := walletService.CreateWallet(ctx, "Alice-Service", 3000)
	if err != nil {
		t.Fatalf("failed to create Alice wallet: %v", err)
	}
	bob, err := walletService.CreateWallet(ctx, "Bob-Service", 1000)
	if err != nil {
		t.Fatalf("failed to create Bob wallet: %v", err)
	}

	// 2. Get Wallet via Service
	fetched, err := walletService.GetWallet(ctx, alice.ID)
	if err != nil || fetched.Balance != 3000 {
		t.Fatalf("expected balance 3000, got %v (err: %v)", fetched, err)
	}

	// 3. Deposit via Service
	tx, err := walletService.Deposit(ctx, alice.ID, 500)
	if err != nil || tx.Amount != 500 {
		t.Fatalf("deposit failed: %v", err)
	}

	// 4. Withdraw via Service
	tx, err = walletService.Withdraw(ctx, alice.ID, 200)
	if err != nil || tx.Amount != 200 {
		t.Fatalf("withdraw failed: %v", err)
	}

	// 5. Transfer via Service
	err = transferService.ProcessTransfer(ctx, alice.ID, bob.ID, 1500)
	if err != nil {
		t.Fatalf("transfer failed: %v", err)
	}

	// 6. Verify balances: Alice: 3000 + 500 - 200 - 1500 = 1800. Bob: 1000 + 1500 = 2500.
	aliceFinal, _ := walletService.GetWallet(ctx, alice.ID)
	bobFinal, _ := walletService.GetWallet(ctx, bob.ID)

	if aliceFinal.Balance != 1800 {
		t.Fatalf("expected Alice balance 1800, got %d", aliceFinal.Balance)
	}
	if bobFinal.Balance != 2500 {
		t.Fatalf("expected Bob balance 2500, got %d", bobFinal.Balance)
	}
}
