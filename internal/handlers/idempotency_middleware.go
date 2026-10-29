package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"

	"github.com/Anant3008/payment-ledger-system/internal/repository"
	"github.com/gin-gonic/gin"
)

// responseBodyWriter intercepts the response body so we can cache it
type responseBodyWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w responseBodyWriter) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}

// IdempotencyMiddleware ensures POST mutating requests process exactly once.
func IdempotencyMiddleware(repo *repository.IdempotencyRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		// We only enforce idempotency on POST requests
		if c.Request.Method != http.MethodPost {
			c.Next()
			return
		}

		key := c.GetHeader("Idempotency-Key")
		if key == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "Idempotency-Key header is required for this operation"})
			return
		}

		locked, err := repo.TryLock(c.Request.Context(), key, c.Request.URL.Path)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal error processing idempotency"})
			return
		}

		if !locked {
			// Key already exists, fetch it
			record, err := repo.Get(c.Request.Context(), key)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal error retrieving idempotency key"})
				return
			}

			if record.Status == "started" {
				c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "request already in progress"})
				return
			}

			if record.Status == "completed" {
				// It's completed, return the cached response
				code := http.StatusOK
				if record.ResponseCode != nil {
					code = *record.ResponseCode
				}
				body := record.ResponseBody
				if len(body) == 0 {
					body = []byte("null")
				}
				c.Data(code, "application/json; charset=utf-8", body)
				c.Abort()
				return
			}
		}

		// Key successfully locked, proceed with request
		bw := &responseBodyWriter{body: bytes.NewBufferString(""), ResponseWriter: c.Writer}
		c.Writer = bw

		c.Next()

		// Save the response after processing completes
		status := c.Writer.Status()
		if status >= http.StatusInternalServerError {
			// Do not cache transient server errors; release key so client can retry
			_ = repo.Delete(c.Request.Context(), key)
			return
		}

		bodyBytes := bw.body.Bytes()
		if len(bodyBytes) == 0 || !json.Valid(bodyBytes) {
			bodyBytes = []byte("null")
		}
		_ = repo.Update(c.Request.Context(), key, status, bodyBytes)
	}
}
