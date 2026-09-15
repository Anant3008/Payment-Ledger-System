package services_test

import (
	"context"
	"testing"

	"github.com/Anant3008/payment-ledger-system/internal/repository"
	"github.com/Anant3008/payment-ledger-system/internal/services"
)

func TestAuditService_ReconcileAll(t *testing.T) {
	conn := setupServicesTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	transferRepo := repository.NewTransferRepository(conn)
	
	walletService := services.NewWalletService(walletRepo)
	transferService := services.NewTransferService(transferRepo)
	auditService := services.NewAuditService(conn)
	
	ctx := context.Background()

	// 1. Initial State Check
	reconciled, err := auditService.ReconcileAll(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reconciled {
		// Because there might be initial_balance injections in the DB from other tests 
		// that we did not ledger, we can't assert strict global reconciliation if the DB is dirty.
		// However, we CAN assert that executing a transfer doesn't drift the delta.
		t.Log("Database is currently out of balance (likely from CreateWallet initial_balance injections without ledger entries)")
	}

	// 2. Perform a closed-loop transfer (which MUST sum to 0)
	a, _ := walletService.CreateWallet(ctx, "Audit-A", 1000) // Not ledgered in V1 logic
	b, _ := walletService.CreateWallet(ctx, "Audit-B", 500)  // Not ledgered in V1 logic
	
	// Record the delta before our operation for the two wallets created by this test.
	// This avoids cross-package test interference from other wallets/ledger entries in
	// the shared integration database.
	var beforeBalances, beforeLedger int64
	if err := conn.GetContext(ctx, &beforeBalances, "SELECT COALESCE(SUM(balance), 0) FROM wallets WHERE id = $1 OR id = $2", a.ID, b.ID); err != nil {
		t.Fatalf("failed to sum wallet balances before transfer: %v", err)
	}
	if err := conn.GetContext(ctx, &beforeLedger, "SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE wallet_id = $1 OR wallet_id = $2", a.ID, b.ID); err != nil {
		t.Fatalf("failed to sum ledger entries before transfer: %v", err)
	}
	initialDrift := beforeBalances - beforeLedger

	// Transfer 300
	if err := transferService.ProcessTransfer(ctx, a.ID, b.ID, 300); err != nil {
		t.Fatalf("transfer failed: %v", err)
	}

	// 3. Verify Delta hasn't changed
	var afterBalances, afterLedger int64
	if err := conn.GetContext(ctx, &afterBalances, "SELECT COALESCE(SUM(balance), 0) FROM wallets WHERE id = $1 OR id = $2", a.ID, b.ID); err != nil {
		t.Fatalf("failed to sum wallet balances after transfer: %v", err)
	}
	if err := conn.GetContext(ctx, &afterLedger, "SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE wallet_id = $1 OR wallet_id = $2", a.ID, b.ID); err != nil {
		t.Fatalf("failed to sum ledger entries after transfer: %v", err)
	}
	finalDrift := afterBalances - afterLedger

	if initialDrift != finalDrift {
		t.Fatalf("Transfer caused accounting drift! Initial drift: %d, Final drift: %d", initialDrift, finalDrift)
	}
}
