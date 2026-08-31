package main

import (
	"log"
	"strings"

	"github.com/Anant3008/payment-ledger-system/internal/config"
	"github.com/Anant3008/payment-ledger-system/internal/db"
	"github.com/Anant3008/payment-ledger-system/internal/handlers"
	"github.com/Anant3008/payment-ledger-system/internal/repository"
	"github.com/Anant3008/payment-ledger-system/internal/services"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	conn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database init: %v", err)
	}
	defer conn.Close()

	// 1. Repositories
	walletRepo := repository.NewWalletRepository(conn)
	transferRepo := repository.NewTransferRepository(conn)

	// 2. Services
	walletService := services.NewWalletService(walletRepo)
	transferService := services.NewTransferService(transferRepo)

	// 3. Handlers
	walletHandler := handlers.NewWalletHandler(walletService)
	transferHandler := handlers.NewTransferHandler(transferService)

	router := gin.Default()

	// Health check
	router.GET("/health", func(c *gin.Context) {
		if err := conn.Ping(); err != nil {
			c.JSON(500, gin.H{"status": "unhealthy", "error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Routes
	router.POST("/wallets", walletHandler.Create)
	router.GET("/wallets/:id", walletHandler.Get)
	router.POST("/transfers", transferHandler.Create)

	addr := cfg.Port
	if !strings.HasPrefix(addr, ":") {
		addr = ":" + addr
	}

	log.Printf("Starting server on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatal(err)
	}
}
