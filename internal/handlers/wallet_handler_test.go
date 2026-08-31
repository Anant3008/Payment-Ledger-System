package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Anant3008/payment-ledger-system/internal/handlers"
	"github.com/Anant3008/payment-ledger-system/internal/services"
	"github.com/gin-gonic/gin"
)

// We will use a mock DB or test DB for this, but since we are focusing on tests covering
// error mapping (e.g. invalid inputs returning 400), we can just hit the handler
// with invalid JSON for the pure handler test.

func TestWalletHandler_Create_InvalidInput(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Create router with error middleware
	router := gin.New()
	router.Use(handlers.ErrorMiddleware())

	// Since we are just testing JSON binding failure, a nil service is safe here
	// because ShouldBindJSON will fail before hitting the service.
	walletHandler := handlers.NewWalletHandler(&services.WalletService{})
	router.POST("/wallets", walletHandler.Create)

	// Send an empty JSON object (missing required "owner")
	body := []byte(`{}`)
	req, _ := http.NewRequest(http.MethodPost, "/wallets", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if response["error"] != "invalid input provided" {
		t.Fatalf("expected error message 'invalid input provided', got '%v'", response["error"])
	}
}

func TestWalletHandler_Get_InvalidIDFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(handlers.ErrorMiddleware())

	walletHandler := handlers.NewWalletHandler(nil)
	router.GET("/wallets/:id", walletHandler.Get)

	req, _ := http.NewRequest(http.MethodGet, "/wallets/abc", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}
