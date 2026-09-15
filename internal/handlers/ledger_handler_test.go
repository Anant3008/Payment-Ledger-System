package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Anant3008/payment-ledger-system/internal/handlers"
	"github.com/gin-gonic/gin"
)

func TestLedgerHandler_GetWalletLedger_InvalidIDFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(handlers.ErrorMiddleware())

	ledgerHandler := handlers.NewLedgerHandler(nil)
	router.GET("/wallets/:id/ledger", ledgerHandler.GetWalletLedger)

	req, _ := http.NewRequest(http.MethodGet, "/wallets/abc/ledger", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestLedgerHandler_GetWalletTransactions_InvalidIDFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(handlers.ErrorMiddleware())

	ledgerHandler := handlers.NewLedgerHandler(nil)
	router.GET("/wallets/:id/transactions", ledgerHandler.GetWalletTransactions)

	req, _ := http.NewRequest(http.MethodGet, "/wallets/invalid-id/transactions", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}
