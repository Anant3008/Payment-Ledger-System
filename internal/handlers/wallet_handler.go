package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
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
		c.Error(fmt.Errorf("bind json: %w", apperrors.ErrInvalidInput))
		return
	}

	wallet, err := h.service.CreateWallet(c.Request.Context(), req.Owner, req.InitialBalance)
	if err != nil {
		c.Error(err)
		return
	}

	c.JSON(http.StatusCreated, wallet)
}

func (h *WalletHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.Error(fmt.Errorf("invalid id format: %w", apperrors.ErrInvalidInput))
		return
	}

	wallet, err := h.service.GetWallet(c.Request.Context(), id)
	if err != nil {
		c.Error(err)
		return
	}

	c.JSON(http.StatusOK, wallet)
}
