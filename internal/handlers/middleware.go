package handlers

import (
	"errors"
	"log/slog"
	"net/http"

	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/gin-gonic/gin"
)

// ErrorMiddleware catches errors attached to the Gin context, logs them securely,
// and maps them to the appropriate HTTP status code and user-friendly message.
func ErrorMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next() // Execute all handlers

		// If no errors were attached, return
		if len(c.Errors) == 0 {
			return
		}

		// Only handle the first error for simplicity
		err := c.Errors[0].Err

		// Map domain errors to HTTP statuses and safe messages
		var status int
		var safeMsg string
		isServerError := false

		switch {
		case errors.Is(err, apperrors.ErrNotFound):
			status = http.StatusNotFound
			safeMsg = "resource not found"
		case errors.Is(err, apperrors.ErrInvalidInput):
			status = http.StatusBadRequest
			safeMsg = "invalid input provided"
		case errors.Is(err, apperrors.ErrInsufficientFunds):
			status = http.StatusBadRequest
			safeMsg = "insufficient funds for transfer"
		case errors.Is(err, apperrors.ErrConflict):
			status = http.StatusConflict
			safeMsg = "resource conflict"
		default:
			// Unhandled errors become 500 Internal Server Errors
			status = http.StatusInternalServerError
			safeMsg = "internal server error"
			isServerError = true
		}

		reqID := c.GetHeader("X-Request-ID")

		if isServerError {
			slog.Error("server error occurred",
				slog.String("path", c.Request.URL.Path),
				slog.String("method", c.Request.Method),
				slog.String("error", err.Error()),
				slog.Int("status", status),
				slog.String("request_id", reqID),
			)
		} else {
			slog.Info("client error",
				slog.String("path", c.Request.URL.Path),
				slog.String("method", c.Request.Method),
				slog.String("error", err.Error()),
				slog.Int("status", status),
				slog.String("request_id", reqID),
			)
		}

		// Return the SAFE message to the client
		c.JSON(status, gin.H{"error": safeMsg})
	}
}

