package repository_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Anant3008/payment-ledger-system/internal/config"
	"github.com/Anant3008/payment-ledger-system/internal/db"
	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/Anant3008/payment-ledger-system/internal/models"
	"github.com/Anant3008/payment-ledger-system/internal/repository"
	"github.com/jmoiron/sqlx"
)

func setupTestDB(t *testing.T) *sqlx.DB {
	t.Helper()
	cfg := config.Load()

	conn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		t.Skipf("Skipping integration test: database unavailable at %s: %v", cfg.DatabaseURL, err)
	}
	return conn
}

// 1. Wallet CRUD & Not Found behavior
func TestWalletRepository_CreateAndGet(t *testing.T) {
	conn := setupTestDB(t)
	defer conn.Close()

	repo := repository.NewWalletRepository(conn)
	ctx := context.Background()

	uniqueOwner := fmt.Sprintf("owner-%d", time.Now().UnixNano())
	w := &models.Wallet{
		Owner:   uniqueOwner,
		Balance: 1250,
	}

	// 1. Create wallet
	err := repo.Create(ctx, w)
	if err != nil {
		t.Fatalf("failed to create wallet: %v", err)
	}
	if w.ID <= 0 {
		t.Fatalf("expected positive wallet ID, got %d", w.ID)
	}
	if w.CreatedAt.IsZero() {
		t.Fatal("expected non-zero created_at timestamp")
	}

	// 2. Fetch wallet
	fetched, err := repo.GetByID(ctx, w.ID)
	if err != nil {
		t.Fatalf("failed to get wallet: %v", err)
	}
	if fetched.ID != w.ID || fetched.Owner != uniqueOwner || fetched.Balance != 1250 {
		t.Fatalf("fetched wallet mismatch: got %+v, expected %+v", fetched, w)
	}

	// 3. Query non-existent wallet
	_, err = repo.GetByID(ctx, 99999999)
	if err == nil {
		t.Fatal("expected error for non-existent wallet ID, got nil")
	}
	if !errors.Is(err, apperrors.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// 2. Atomic Deposit & Withdrawal with Balance and Ledger Verification
func TestWalletRepository_DepositAndWithdrawal_LedgerIntegrity(t *testing.T) {
	conn := setupTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	ledgerRepo := repository.NewLedgerRepository(conn)
	ctx := context.Background()

	w := &models.Wallet{
		Owner:   fmt.Sprintf("wallet-ledger-%d", time.Now().UnixNano()),
		Balance: 1000,
	}
	if err := walletRepo.Create(ctx, w); err != nil {
		t.Fatalf("failed to create wallet: %v", err)
	}

	// 1. Deposit 500
	depositTx, err := walletRepo.Deposit(ctx, w.ID, 500)
	if err != nil {
		t.Fatalf("deposit failed: %v", err)
	}
	if depositTx.Amount != 500 || depositTx.Type != "deposit" || depositTx.Status != "completed" {
		t.Fatalf("unexpected deposit transaction: %+v", depositTx)
	}

	// Verify balance is now 1500
	afterDeposit, err := walletRepo.GetByID(ctx, w.ID)
	if err != nil {
		t.Fatalf("failed to get wallet after deposit: %v", err)
	}
	if afterDeposit.Balance != 1500 {
		t.Fatalf("expected balance 1500, got %d", afterDeposit.Balance)
	}

	// Verify ledger entry
	entries, err := ledgerRepo.ListByWallet(ctx, w.ID, 10, 0)
	if err != nil {
		t.Fatalf("failed to fetch ledger: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 ledger entry, got %d", len(entries))
	}
	if entries[0].Amount != 500 || entries[0].TransactionID != depositTx.ID {
		t.Fatalf("unexpected ledger entry: %+v", entries[0])
	}

	// 2. Withdraw 400
	withdrawTx, err := walletRepo.Withdraw(ctx, w.ID, 400)
	if err != nil {
		t.Fatalf("withdrawal failed: %v", err)
	}
	if withdrawTx.Amount != 400 || withdrawTx.Type != "withdrawal" || withdrawTx.Status != "completed" {
		t.Fatalf("unexpected withdrawal transaction: %+v", withdrawTx)
	}

	// Verify balance is now 1100 (1500 - 400)
	afterWithdraw, err := walletRepo.GetByID(ctx, w.ID)
	if err != nil {
		t.Fatalf("failed to get wallet after withdraw: %v", err)
	}
	if afterWithdraw.Balance != 1100 {
		t.Fatalf("expected balance 1100, got %d", afterWithdraw.Balance)
	}

	// Verify ledger entries (now 2: +500 and -400)
	entries, err = ledgerRepo.ListByWallet(ctx, w.ID, 10, 0)
	if err != nil {
		t.Fatalf("failed to fetch ledger: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 ledger entries, got %d", len(entries))
	}
	// Ordered descending by ID: latest is withdrawal (-400)
	if entries[0].Amount != -400 {
		t.Fatalf("expected latest ledger entry to be -400, got %d", entries[0].Amount)
	}
	if entries[1].Amount != 500 {
		t.Fatalf("expected previous ledger entry to be 500, got %d", entries[1].Amount)
	}

	// 3. Overdraft Withdrawal Attempt (Attempting to withdraw 5000 from 1100)
	_, err = walletRepo.Withdraw(ctx, w.ID, 5000)
	if err == nil {
		t.Fatal("expected ErrInsufficientFunds on overdraft, got nil")
	}
	if !errors.Is(err, apperrors.ErrInsufficientFunds) {
		t.Fatalf("expected ErrInsufficientFunds, got %v", err)
	}

	// Verify Atomic Rollback: balance must STILL be 1100 and ledger entries count STILL 2
	finalWallet, _ := walletRepo.GetByID(ctx, w.ID)
	if finalWallet.Balance != 1100 {
		t.Fatalf("balance mutated on failed withdrawal! expected 1100, got %d", finalWallet.Balance)
	}
	finalEntries, _ := ledgerRepo.ListByWallet(ctx, w.ID, 10, 0)
	if len(finalEntries) != 2 {
		t.Fatalf("ledger entries mutated on failed withdrawal! expected 2, got %d", len(finalEntries))
	}
}

// 3. Atomic Money Transfer & Double-Entry Ledger Invariant Verification
func TestTransferRepository_AtomicDoubleEntryTransfer(t *testing.T) {
	conn := setupTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	transferRepo := repository.NewTransferRepository(conn)
	ledgerRepo := repository.NewLedgerRepository(conn)
	ctx := context.Background()

	alice := &models.Wallet{Owner: fmt.Sprintf("Alice-%d", time.Now().UnixNano()), Balance: 5000}
	bob := &models.Wallet{Owner: fmt.Sprintf("Bob-%d", time.Now().UnixNano()), Balance: 2000}

	if err := walletRepo.Create(ctx, alice); err != nil {
		t.Fatalf("failed to create Alice: %v", err)
	}
	if err := walletRepo.Create(ctx, bob); err != nil {
		t.Fatalf("failed to create Bob: %v", err)
	}

	// Transfer 1500 from Alice to Bob
	err := transferRepo.ExecuteTransfer(ctx, alice.ID, bob.ID, 1500)
	if err != nil {
		t.Fatalf("transfer failed: %v", err)
	}

	// Verify Balances
	aliceAfter, _ := walletRepo.GetByID(ctx, alice.ID)
	bobAfter, _ := walletRepo.GetByID(ctx, bob.ID)

	if aliceAfter.Balance != 3500 {
		t.Fatalf("expected Alice balance 3500, got %d", aliceAfter.Balance)
	}
	if bobAfter.Balance != 3500 {
		t.Fatalf("expected Bob balance 3500, got %d", bobAfter.Balance)
	}

	// Check Ledger Entries for Alice (Debit -1500)
	aliceEntries, err := ledgerRepo.ListByWallet(ctx, alice.ID, 10, 0)
	if err != nil || len(aliceEntries) != 1 {
		t.Fatalf("expected 1 ledger entry for Alice, got %d (err: %v)", len(aliceEntries), err)
	}
	if aliceEntries[0].Amount != -1500 {
		t.Fatalf("expected Alice debit -1500, got %d", aliceEntries[0].Amount)
	}

	// Check Ledger Entries for Bob (Credit +1500)
	bobEntries, err := ledgerRepo.ListByWallet(ctx, bob.ID, 10, 0)
	if err != nil || len(bobEntries) != 1 {
		t.Fatalf("expected 1 ledger entry for Bob, got %d (err: %v)", len(bobEntries), err)
	}
	if bobEntries[0].Amount != 1500 {
		t.Fatalf("expected Bob credit +1500, got %d", bobEntries[0].Amount)
	}

	// Double-entry accounting rule: The two entries must share the same transaction_id
	if aliceEntries[0].TransactionID != bobEntries[0].TransactionID {
		t.Fatalf("double-entry ledger entries must share same transaction_id: %d vs %d",
			aliceEntries[0].TransactionID, bobEntries[0].TransactionID)
	}

	// Double-entry invariant: Sum of ledger entries for this transaction must equal zero
	txEntries, err := ledgerRepo.ListByTransaction(ctx, aliceEntries[0].TransactionID)
	if err != nil || len(txEntries) != 2 {
		t.Fatalf("expected 2 entries for transaction %d, got %d (err: %v)",
			aliceEntries[0].TransactionID, len(txEntries), err)
	}
	sum := txEntries[0].Amount + txEntries[1].Amount
	if sum != 0 {
		t.Fatalf("DOUBLE-ENTRY CORRUPTION: sum of ledger entries is %d, must be 0", sum)
	}
}

// 4. Overdraft Transfer with Zero Balance Mutation
func TestTransferRepository_InsufficientFunds_NoMutation(t *testing.T) {
	conn := setupTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	transferRepo := repository.NewTransferRepository(conn)
	ctx := context.Background()

	alice := &models.Wallet{Owner: fmt.Sprintf("Alice-%d", time.Now().UnixNano()), Balance: 300}
	bob := &models.Wallet{Owner: fmt.Sprintf("Bob-%d", time.Now().UnixNano()), Balance: 1000}

	_ = walletRepo.Create(ctx, alice)
	_ = walletRepo.Create(ctx, bob)

	// Attempt transferring 500 when Alice only has 300
	err := transferRepo.ExecuteTransfer(ctx, alice.ID, bob.ID, 500)
	if err == nil {
		t.Fatal("expected ErrInsufficientFunds, got nil")
	}
	if !errors.Is(err, apperrors.ErrInsufficientFunds) {
		t.Fatalf("expected ErrInsufficientFunds, got %v", err)
	}

	// Verify neither balance changed
	aAfter, _ := walletRepo.GetByID(ctx, alice.ID)
	bAfter, _ := walletRepo.GetByID(ctx, bob.ID)

	if aAfter.Balance != 300 {
		t.Fatalf("Alice balance altered on failed transfer! Expected 300, got %d", aAfter.Balance)
	}
	if bAfter.Balance != 1000 {
		t.Fatalf("Bob balance altered on failed transfer! Expected 1000, got %d", bAfter.Balance)
	}
}

// 5. Massive Concurrency & Deadlock Immunity Stress Test
// 40 goroutines transfer concurrently between Wallet A and Wallet B:
// 20 goroutines: A -> B ($100 each)
// 20 goroutines: B -> A ($100 each)
// In a non-deadlock-free design, cross-locking A and B causes SQL deadlock error 40P01.
// In our deterministic ID order locking, ALL 40 transfers MUST complete with 0 deadlocks,
// and final balances must equal original balances exactly.
func TestTransferRepository_DeadlockPrevention_StressTest(t *testing.T) {
	conn := setupTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	transferRepo := repository.NewTransferRepository(conn)
	ctx := context.Background()

	const initialBalance int64 = 10000
	const transferAmount int64 = 100
	const concurrentTransfers = 20 // 20 A->B and 20 B->A = 40 total

	walletA := &models.Wallet{Owner: fmt.Sprintf("ConcurrentA-%d", time.Now().UnixNano()), Balance: initialBalance}
	walletB := &models.Wallet{Owner: fmt.Sprintf("ConcurrentB-%d", time.Now().UnixNano()), Balance: initialBalance}

	if err := walletRepo.Create(ctx, walletA); err != nil {
		t.Fatalf("failed to create wallet A: %v", err)
	}
	if err := walletRepo.Create(ctx, walletB); err != nil {
		t.Fatalf("failed to create wallet B: %v", err)
	}

	var wg sync.WaitGroup
	errCh := make(chan error, concurrentTransfers*2)

	// Launch 20 A -> B
	for i := 0; i < concurrentTransfers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := transferRepo.ExecuteTransfer(ctx, walletA.ID, walletB.ID, transferAmount); err != nil {
				errCh <- fmt.Errorf("A->B transfer error: %w", err)
			}
		}()
	}

	// Launch 20 B -> A simultaneously
	for i := 0; i < concurrentTransfers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := transferRepo.ExecuteTransfer(ctx, walletB.ID, walletA.ID, transferAmount); err != nil {
				errCh <- fmt.Errorf("B->A transfer error: %w", err)
			}
		}()
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Fatalf("Concurrency stress test failed with error: %v", err)
	}

	// Verify Total Financial Conservation:
	// Money cannot be created or destroyed:
	// Balance A must be exactly 10,000
	// Balance B must be exactly 10,000
	finalA, _ := walletRepo.GetByID(ctx, walletA.ID)
	finalB, _ := walletRepo.GetByID(ctx, walletB.ID)

	if finalA.Balance != initialBalance {
		t.Fatalf("Financial Conservation Violated for Wallet A! Expected %d, got %d", initialBalance, finalA.Balance)
	}
	if finalB.Balance != initialBalance {
		t.Fatalf("Financial Conservation Violated for Wallet B! Expected %d, got %d", initialBalance, finalB.Balance)
	}
	if finalA.Balance+finalB.Balance != initialBalance*2 {
		t.Fatalf("Total system money drift! Expected %d, got %d", initialBalance*2, finalA.Balance+finalB.Balance)
	}
}

// 6. Pagination & Ordering in Ledger & Transaction Repositories
func TestLedgerRepository_PaginationAndOrdering(t *testing.T) {
	conn := setupTestDB(t)
	defer conn.Close()

	walletRepo := repository.NewWalletRepository(conn)
	ledgerRepo := repository.NewLedgerRepository(conn)
	ctx := context.Background()

	w := &models.Wallet{Owner: fmt.Sprintf("Paginated-%d", time.Now().UnixNano()), Balance: 0}
	_ = walletRepo.Create(ctx, w)

	// Perform 10 deposits
	for i := 1; i <= 10; i++ {
		_, err := walletRepo.Deposit(ctx, w.ID, int64(i*10))
		if err != nil {
			t.Fatalf("failed deposit %d: %v", i, err)
		}
	}

	// Page 1: limit 4, offset 0 -> items 10, 9, 8, 7 (descending)
	page1, err := ledgerRepo.ListByWallet(ctx, w.ID, 4, 0)
	if err != nil {
		t.Fatalf("failed page 1: %v", err)
	}
	if len(page1) != 4 {
		t.Fatalf("expected 4 entries on page 1, got %d", len(page1))
	}
	if page1[0].Amount != 100 || page1[1].Amount != 90 || page1[2].Amount != 80 || page1[3].Amount != 70 {
		t.Fatalf("page 1 ordering incorrect: got amounts [%d, %d, %d, %d]",
			page1[0].Amount, page1[1].Amount, page1[2].Amount, page1[3].Amount)
	}

	// Page 2: limit 4, offset 4 -> items 6, 5, 4, 3
	page2, err := ledgerRepo.ListByWallet(ctx, w.ID, 4, 4)
	if err != nil {
		t.Fatalf("failed page 2: %v", err)
	}
	if len(page2) != 4 {
		t.Fatalf("expected 4 entries on page 2, got %d", len(page2))
	}
	if page2[0].Amount != 60 || page2[3].Amount != 30 {
		t.Fatalf("page 2 ordering incorrect: got amounts [%d ... %d]", page2[0].Amount, page2[3].Amount)
	}

	// Verify no duplicates between pages
	seen := make(map[int]bool)
	for _, e := range page1 {
		seen[e.ID] = true
	}
	for _, e := range page2 {
		if seen[e.ID] {
			t.Fatalf("duplicate entry %d found across pages 1 and 2", e.ID)
		}
	}
}
