package handlers

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
)

// RequestIDMiddleware injects a unique request ID into each request.
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		reqID := c.GetHeader("X-Request-ID")
		if reqID == "" {
			b := make([]byte, 16)
			_, _ = rand.Read(b)
			reqID = hex.EncodeToString(b)
		}

		c.Header("X-Request-ID", reqID)

		// Set it back in the header so c.GetHeader picks it up inside ErrorMiddleware
		c.Request.Header.Set("X-Request-ID", reqID)

		c.Next()
	}
}
