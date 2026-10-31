package services_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

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

	err = service.ProcessTransfer(context.Background(), -1, 2, 500)
	if !errors.Is(err, apperrors.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for negative from_wallet_id, got %v", err)
	}

	err = service.ProcessTransfer(context.Background(), 1, 0, 500)
	if !errors.Is(err, apperrors.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for zero to_wallet_id, got %v", err)
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
	transferService.StartBatchWorker()
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

func TestTransferService_ClientCancelledBeforeBatch_DoesNotMutateBalance(t *testing.T) {
	conn := setupServicesTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	transferRepo := repository.NewTransferRepository(conn)

	walletService := services.NewWalletService(walletRepo)
	transferService := services.NewTransferService(transferRepo)

	ctx := context.Background()
	alice, err := walletService.CreateWallet(ctx, "CancelAlice", 2000)
	if err != nil {
		t.Fatalf("failed to create Alice: %v", err)
	}
	bob, err := walletService.CreateWallet(ctx, "CancelBob", 500)
	if err != nil {
		t.Fatalf("failed to create Bob: %v", err)
	}

	// Do NOT start worker yet. Job enters queue while worker is idle.
	cancelCtx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() {
		done <- transferService.ProcessTransfer(cancelCtx, alice.ID, bob.ID, 300)
	}()

	// Give it a moment to land in queue
	time.Sleep(10 * time.Millisecond)

	// Now client context cancels (timeout/disconnect)
	cancel()

	// ProcessTransfer returns context.Canceled
	err = <-done
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}

	// Now start the batch worker to process what was in the queue
	transferService.StartBatchWorker()
	time.Sleep(50 * time.Millisecond)
	transferService.Stop()

	// Alice's balance must still be 2000, Bob's must still be 500!
	aliceCheck, err := walletService.GetWallet(ctx, alice.ID)
	if err != nil || aliceCheck.Balance != 2000 {
		t.Fatalf("phantom transfer occurred! expected Alice balance 2000, got %v", aliceCheck.Balance)
	}
	bobCheck, err := walletService.GetWallet(ctx, bob.ID)
	if err != nil || bobCheck.Balance != 500 {
		t.Fatalf("phantom transfer occurred! expected Bob balance 500, got %v", bobCheck.Balance)
	}
}

func TestTransferService_QueueBackpressure(t *testing.T) {
	// Service with tiny queue capacity of 2 items
	transferService := services.NewTransferServiceWithCapacity(nil, 2)

	// Fill the queue
	ctx := context.Background()
	go transferService.ProcessTransfer(ctx, 1, 2, 100)
	go transferService.ProcessTransfer(ctx, 1, 2, 200)

	time.Sleep(10 * time.Millisecond)

	// Third transfer should fail immediately with ErrQueueFull instead of blocking
	err := transferService.ProcessTransfer(ctx, 1, 2, 300)
	if !errors.Is(err, apperrors.ErrQueueFull) {
		t.Fatalf("expected ErrQueueFull on saturated queue, got %v", err)
	}
}

func TestTransferService_Stop_DrainsEntireQueue(t *testing.T) {
	conn := setupServicesTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	transferRepo := repository.NewTransferRepository(conn)

	walletService := services.NewWalletService(walletRepo)
	transferService := services.NewTransferService(transferRepo)

	ctx := context.Background()
	alice, err := walletService.CreateWallet(ctx, "DrainAlice", 5000)
	if err != nil {
		t.Fatalf("failed to create Alice: %v", err)
	}
	bob, err := walletService.CreateWallet(ctx, "DrainBob", 100)
	if err != nil {
		t.Fatalf("failed to create Bob: %v", err)
	}

	// Launch 70 concurrent transfers (more than 1 batch size of 50)
	const numTransfers = 70
	const transferAmount = int64(10)
	var wg sync.WaitGroup
	errs := make(chan error, numTransfers)

	for i := 0; i < numTransfers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- transferService.ProcessTransfer(ctx, alice.ID, bob.ID, transferAmount)
		}()
	}

	// Wait briefly for all jobs to be enqueued
	time.Sleep(20 * time.Millisecond)

	// Now start and immediately trigger Stop shutdown
	transferService.StartBatchWorker()
	transferService.Stop()

	// Wait for all callers to return (with timeout guard)
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(1 * time.Second):
		t.Fatal("shutdown hung! Queue items were abandoned in jobQueue")
	}

	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("transfer failed during shutdown: %v", err)
		}
	}

	// Verify all 70 transfers were processed and committed!
	// Alice: 5000 - (70 * 10) = 4300. Bob: 100 + 700 = 800.
	aliceFinal, _ := walletService.GetWallet(ctx, alice.ID)
	bobFinal, _ := walletService.GetWallet(ctx, bob.ID)

	expectedAlice := int64(5000 - (numTransfers * transferAmount))
	expectedBob := int64(100 + (numTransfers * transferAmount))

	if aliceFinal.Balance != expectedAlice {
		t.Fatalf("shutdown dropped transfers! expected Alice balance %d, got %d", expectedAlice, aliceFinal.Balance)
	}
	if bobFinal.Balance != expectedBob {
		t.Fatalf("shutdown dropped transfers! expected Bob balance %d, got %d", expectedBob, bobFinal.Balance)
	}
}
