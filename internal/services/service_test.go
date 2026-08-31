package services_test

import (
	"context"
	"errors"
	"testing"

	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
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
