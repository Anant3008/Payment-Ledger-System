package handlers

import (
	"net/http"

	"github.com/Anant3008/payment-ledger-system/internal/services"
	"github.com/gin-gonic/gin"
)

type WalletHandler struct {
	service *services.WalletService
}

func NewWalletHandler(service *services.WalletService) *WalletHandler {
	return &WalletHandler{service: service}
}

type createWalletReq struct {
	Owner          string `json:"owner" binding:"required"`
	InitialBalance int64  `json:"initial_balance"`
}

func (h *WalletHandler) Create(c *gin.Context) {
	var req createWalletReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	wallet, err := h.service.CreateWallet(c.Request.Context(), req.Owner, req.InitialBalance)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, wallet)
}
