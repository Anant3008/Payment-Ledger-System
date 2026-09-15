package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/Anant3008/payment-ledger-system/internal/services"
	"github.com/gin-gonic/gin"
)

type LedgerHandler struct {
	service *services.LedgerService
}

func NewLedgerHandler(service *services.LedgerService) *LedgerHandler {
	return &LedgerHandler{service: service}
}

// GetWalletLedger retrieves ledger entries for a wallet.
func (h *LedgerHandler) GetWalletLedger(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.Error(fmt.Errorf("invalid id format: %w", apperrors.ErrInvalidInput))
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	entries, err := h.service.GetWalletLedger(c.Request.Context(), id, limit, offset)
	if err != nil {
		c.Error(err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"wallet_id": id,
		"limit":     limit,
		"offset":    offset,
		"entries":   entries,
	})
}

// GetWalletTransactions retrieves transactions for a wallet.
func (h *LedgerHandler) GetWalletTransactions(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.Error(fmt.Errorf("invalid id format: %w", apperrors.ErrInvalidInput))
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	transactions, err := h.service.GetWalletTransactions(c.Request.Context(), id, limit, offset)
	if err != nil {
		c.Error(err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"wallet_id":    id,
		"limit":        limit,
		"offset":       offset,
		"transactions": transactions,
	})
}
