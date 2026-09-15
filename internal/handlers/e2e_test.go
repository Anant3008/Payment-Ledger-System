package handlers_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Anant3008/payment-ledger-system/internal/config"
	"github.com/Anant3008/payment-ledger-system/internal/db"
	"github.com/Anant3008/payment-ledger-system/internal/handlers"
	"github.com/Anant3008/payment-ledger-system/internal/models"
	"github.com/Anant3008/payment-ledger-system/internal/repository"
	"github.com/Anant3008/payment-ledger-system/internal/services"
	"github.com/gin-gonic/gin"
)

func setupTestRouter(t *testing.T) *gin.Engine {
	t.Helper()
	cfg := config.Load()

	conn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		t.Skipf("Skipping E2E test: database unavailable at %s: %v", cfg.DatabaseURL, err)
	}

	gin.SetMode(gin.TestMode)

	walletRepo := repository.NewWalletRepository(conn)
	transferRepo := repository.NewTransferRepository(conn)
	ledgerRepo := repository.NewLedgerRepository(conn)
	txRepo := repository.NewTransactionRepository(conn)
	idempRepo := repository.NewIdempotencyRepository(conn)

	walletService := services.NewWalletService(walletRepo)
	transferService := services.NewTransferService(transferRepo)
	ledgerService := services.NewLedgerService(ledgerRepo, txRepo, walletRepo)

	walletHandler := handlers.NewWalletHandler(walletService)
	transferHandler := handlers.NewTransferHandler(transferService)
	ledgerHandler := handlers.NewLedgerHandler(ledgerService)

	router := gin.New()
	router.Use(handlers.RequestIDMiddleware())
	router.Use(handlers.ErrorMiddleware())

	mutating := router.Group("/")
	mutating.Use(handlers.IdempotencyMiddleware(idempRepo))

	mutating.POST("/wallets", walletHandler.Create)
	router.GET("/wallets/:id", walletHandler.Get)
	mutating.POST("/wallets/:id/deposit", walletHandler.Deposit)
	mutating.POST("/wallets/:id/withdraw", walletHandler.Withdraw)
	router.GET("/wallets/:id/ledger", ledgerHandler.GetWalletLedger)
	router.GET("/wallets/:id/transactions", ledgerHandler.GetWalletTransactions)
	mutating.POST("/transfers", transferHandler.Create)

	return router
}

func TestE2E_FullPaymentLifecycle(t *testing.T) {
	router := setupTestRouter(t)

	// 1. Create Alice's Wallet with initial balance 2000
	alicePayload := fmt.Sprintf(`{"owner": "Alice-%d", "initial_balance": 2000}`, time.Now().UnixNano())
	req, _ := http.NewRequest(http.MethodPost, "/wallets", bytes.NewBufferString(alicePayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", fmt.Sprintf("idk-%d", time.Now().UnixNano()))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("failed to create Alice wallet: code %d, body: %s", w.Code, w.Body.String())
	}
	var alice models.Wallet
	json.Unmarshal(w.Body.Bytes(), &alice)
	if alice.ID <= 0 || alice.Balance != 2000 {
		t.Fatalf("unexpected Alice wallet data: %+v", alice)
	}

	// 2. Create Bob's Wallet with initial balance 500
	bobPayload := fmt.Sprintf(`{"owner": "Bob-%d", "initial_balance": 500}`, time.Now().UnixNano())
	req, _ = http.NewRequest(http.MethodPost, "/wallets", bytes.NewBufferString(bobPayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", fmt.Sprintf("idk-%d", time.Now().UnixNano()))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("failed to create Bob wallet: code %d, body: %s", w.Code, w.Body.String())
	}
	var bob models.Wallet
	json.Unmarshal(w.Body.Bytes(), &bob)
	if bob.ID <= 0 || bob.Balance != 500 {
		t.Fatalf("unexpected Bob wallet data: %+v", bob)
	}

	// 3. Deposit $500 into Alice's Wallet
	depositPayload := `{"amount": 500}`
	req, _ = http.NewRequest(http.MethodPost, fmt.Sprintf("/wallets/%d/deposit", alice.ID), bytes.NewBufferString(depositPayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", fmt.Sprintf("idk-%d", time.Now().UnixNano()))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("failed to deposit into Alice: code %d, body: %s", w.Code, w.Body.String())
	}

	// 4. Verify Alice's updated balance via GET /wallets/:id (2000 + 500 = 2500)
	req, _ = http.NewRequest(http.MethodGet, fmt.Sprintf("/wallets/%d", alice.ID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("failed to get Alice wallet: code %d", w.Code)
	}
	var aliceAfterDeposit models.Wallet
	json.Unmarshal(w.Body.Bytes(), &aliceAfterDeposit)
	if aliceAfterDeposit.Balance != 2500 {
		t.Fatalf("expected Alice balance 2500, got %d", aliceAfterDeposit.Balance)
	}

	// 5. Transfer $1000 from Alice to Bob
	transferPayload := fmt.Sprintf(`{"from_wallet_id": %d, "to_wallet_id": %d, "amount": 1000}`, alice.ID, bob.ID)
	req, _ = http.NewRequest(http.MethodPost, "/transfers", bytes.NewBufferString(transferPayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", fmt.Sprintf("idk-%d", time.Now().UnixNano()))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("failed to transfer: code %d, body: %s", w.Code, w.Body.String())
	}

	// 6. Verify balances after transfer: Alice should have 1500 (2500 - 1000), Bob should have 1500 (500 + 1000)
	req, _ = http.NewRequest(http.MethodGet, fmt.Sprintf("/wallets/%d", alice.ID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var aliceFinal models.Wallet
	json.Unmarshal(w.Body.Bytes(), &aliceFinal)
	if aliceFinal.Balance != 1500 {
		t.Fatalf("expected Alice final balance 1500, got %d", aliceFinal.Balance)
	}

	req, _ = http.NewRequest(http.MethodGet, fmt.Sprintf("/wallets/%d", bob.ID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var bobFinal models.Wallet
	json.Unmarshal(w.Body.Bytes(), &bobFinal)
	if bobFinal.Balance != 1500 {
		t.Fatalf("expected Bob final balance 1500, got %d", bobFinal.Balance)
	}

	// 7. Verify Alice's ledger via GET /wallets/:id/ledger (should have deposit +500 and transfer debit -1000)
	req, _ = http.NewRequest(http.MethodGet, fmt.Sprintf("/wallets/%d/ledger?limit=10&offset=0", alice.ID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("failed to get Alice ledger: code %d", w.Code)
	}
	var ledgerResp struct {
		WalletID int                  `json:"wallet_id"`
		Entries  []models.LedgerEntry `json:"entries"`
	}
	json.Unmarshal(w.Body.Bytes(), &ledgerResp)
	if len(ledgerResp.Entries) != 2 {
		t.Fatalf("expected 2 ledger entries for Alice, got %d", len(ledgerResp.Entries))
	}

	// 8. Overdraft withdrawal test: Alice tries to withdraw 5000 when balance is 1500 -> 400 Bad Request
	excessWithdrawPayload := `{"amount": 5000}`
	req, _ = http.NewRequest(http.MethodPost, fmt.Sprintf("/wallets/%d/withdraw", alice.ID), bytes.NewBufferString(excessWithdrawPayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", fmt.Sprintf("idk-%d", time.Now().UnixNano()))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for overdraft withdrawal, got %d", w.Code)
	}
	var errResp map[string]string
	json.Unmarshal(w.Body.Bytes(), &errResp)
	if errResp["error"] != "insufficient funds for transfer" {
		t.Fatalf("expected error 'insufficient funds for transfer', got '%s'", errResp["error"])
	}

	// 9. Non-existent wallet lookup -> 404 Not Found
	req, _ = http.NewRequest(http.MethodGet, "/wallets/99999999", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for missing wallet, got %d", w.Code)
	}

	// 10. Self-transfer test: Alice to Alice -> 400 Bad Request
	selfTransferPayload := fmt.Sprintf(`{"from_wallet_id": %d, "to_wallet_id": %d, "amount": 100}`, alice.ID, alice.ID)
	req, _ = http.NewRequest(http.MethodPost, "/transfers", bytes.NewBufferString(selfTransferPayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", fmt.Sprintf("idk-%d", time.Now().UnixNano()))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for self-transfer, got %d", w.Code)
	}
}

func TestE2E_Idempotency(t *testing.T) {
	router := setupTestRouter(t)
	idempKey := fmt.Sprintf("idemp-test-%d", time.Now().UnixNano())

	// 1. First Request
	payload := fmt.Sprintf(`{"owner": "IdempUser", "initial_balance": 100}`)
	req1, _ := http.NewRequest(http.MethodPost, "/wallets", bytes.NewBufferString(payload))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Idempotency-Key", idempKey)
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d", w1.Code)
	}

	// 2. Second Request (Exact same key)
	req2, _ := http.NewRequest(http.MethodPost, "/wallets", bytes.NewBufferString(payload))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Idempotency-Key", idempKey)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	// It should return the exact same body and status code (201 Created) without creating another wallet.
	if w1.Code != w2.Code {
		t.Fatalf("Idempotency failed: expected status %d to equal %d", w1.Code, w2.Code)
	}

	// JSON keys might be reordered when unmarshaling map[string]interface{} inside the middleware,
	// so we compare the parsed objects instead of raw strings.
	var b1, b2 map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &b1)
	json.Unmarshal(w2.Body.Bytes(), &b2)

	if b1["id"] != b2["id"] || b1["balance"] != b2["balance"] {
		t.Fatalf("Idempotency failed: parsed bodies differ. b1=%v, b2=%v", b1, b2)
	}
}
