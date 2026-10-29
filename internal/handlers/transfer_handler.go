package handlers

import (
	"fmt"
	"net/http"

	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/Anant3008/payment-ledger-system/internal/models"
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
	FromWalletID models.FlexibleID `json:"from_wallet_id" binding:"required"`
	ToWalletID   models.FlexibleID `json:"to_wallet_id" binding:"required"`
	Amount       int64             `json:"amount" binding:"required,gt=0"`
}

func (h *TransferHandler) Create(c *gin.Context) {
	var req transferReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.Error(fmt.Errorf("bind json: %w", apperrors.ErrInvalidInput))
		return
	}

	err := h.service.ProcessTransfer(c.Request.Context(), req.FromWalletID.Int(), req.ToWalletID.Int(), req.Amount)
	if err != nil {
		c.Error(err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "transfer completed"})
}
