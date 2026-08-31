package handlers

import (
	"net/http"

	"github.com/Anant3008/payment-ledger-system/internal/services"
	"github.com/gin-gonic/gin"
)

type TransferHandler struct {
	service *services.TransferService
}

func NewTransferHandler(service *services.TransferService) *TransferHandler {
	return &TransferHandler{service: service}
}

type transferReq struct {
	FromWalletID int   `json:"from_wallet_id" binding:"required"`
	ToWalletID   int   `json:"to_wallet_id" binding:"required"`
	Amount       int64 `json:"amount" binding:"required,gt=0"`
}

func (h *TransferHandler) Create(c *gin.Context) {
	var req transferReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.service.ProcessTransfer(c.Request.Context(), req.FromWalletID, req.ToWalletID, req.Amount)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "transfer completed"})
}
