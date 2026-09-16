package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

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
	ledgerRepo := repository.NewLedgerRepository(conn)
	txRepo := repository.NewTransactionRepository(conn)
	idempRepo := repository.NewIdempotencyRepository(conn)

	// 2. Services
	walletService := services.NewWalletService(walletRepo)
	transferService := services.NewTransferService(transferRepo)
	ledgerService := services.NewLedgerService(ledgerRepo, txRepo, walletRepo)

	// 3. Handlers
	walletHandler := handlers.NewWalletHandler(walletService)
	transferHandler := handlers.NewTransferHandler(transferService)
	ledgerHandler := handlers.NewLedgerHandler(ledgerService)

	router := gin.Default()
	router.Use(handlers.RequestIDMiddleware())
	router.Use(handlers.ErrorMiddleware())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		if err := conn.Ping(); err != nil {
			c.JSON(500, gin.H{"status": "unhealthy", "error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Routes
	mutating := router.Group("/")
	mutating.Use(handlers.IdempotencyMiddleware(idempRepo))

	mutating.POST("/wallets", walletHandler.Create)
	mutating.POST("/wallets/:id/deposit", walletHandler.Deposit)
	mutating.POST("/wallets/:id/withdraw", walletHandler.Withdraw)
	mutating.POST("/transfers", transferHandler.Create)

	router.GET("/wallets/:id", walletHandler.Get)
	router.GET("/wallets/:id/ledger", ledgerHandler.GetWalletLedger)
	router.GET("/wallets/:id/transactions", ledgerHandler.GetWalletTransactions)

	addr := cfg.Port
	if !strings.HasPrefix(addr, ":") {
		addr = ":" + addr
	}

	srv := &http.Server{
		Addr:    addr,
		Handler: router,
	}

	// Initializing the server in a goroutine so that it won't block
	go func() {
		log.Printf("Starting server on %s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// The context is used to inform the server it has 5 seconds to finish
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown: ", err)
	}

	log.Println("Server exiting")
}
