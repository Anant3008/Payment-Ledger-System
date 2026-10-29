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

	// Start background micro-batching worker
	transferService.StartBatchWorker()

	// 3. Handlers
	walletHandler := handlers.NewWalletHandler(walletService)
	transferHandler := handlers.NewTransferHandler(transferService)
	ledgerHandler := handlers.NewLedgerHandler(ledgerService)

	router := gin.Default()
	router.Use(handlers.RequestIDMiddleware())
	router.Use(handlers.IdempotencyMiddleware(idempRepo))
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
	router.POST("/wallets", walletHandler.Create)
	router.POST("/wallets/:id/deposit", walletHandler.Deposit)
	router.POST("/wallets/:id/withdraw", walletHandler.Withdraw)
	router.POST("/transfers", transferHandler.Create)

	router.GET("/wallets/:id", walletHandler.Get)
	router.GET("/wallets/:id/ledger", ledgerHandler.GetWalletLedger)
	router.GET("/wallets/:id/transactions", ledgerHandler.GetWalletTransactions)

	addr := cfg.Port
	if !strings.HasPrefix(addr, ":") {
		addr = ":" + addr
	}

	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
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

	// 1. First: Stop accepting new HTTP requests and drain active handlers
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	// 2. Second: Stop batching worker to drain and commit any remaining queued transfers to DB
	transferService.Stop()

	log.Println("Server exiting")
}
