package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"time"

	"github.com/Anant3008/payment-ledger-system/internal/config"
	"github.com/Anant3008/payment-ledger-system/internal/db"
	"github.com/Anant3008/payment-ledger-system/internal/services"
)

func main() {
	cfg := config.Load()

	conn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database init failed: %v", err)
	}
	defer conn.Close()

	auditService := services.NewAuditService(conn)
	
	// Create context that listens for the interrupt signal from the OS.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	log.Println("Starting continuous ledger balance reconciliation worker...")

	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	// Run initial audit immediately
	runAudit(ctx, auditService)

	for {
		select {
		case <-ctx.Done():
			log.Println("Audit worker shutting down gracefully...")
			return
		case <-ticker.C:
			runAudit(ctx, auditService)
		}
	}
}

func runAudit(ctx context.Context, auditService *services.AuditService) {
	reconciled, err := auditService.ReconcileAll(ctx)
	if err != nil {
		log.Printf("ERROR: Failed to run reconciliation audit: %v", err)
	} else if !reconciled {
		log.Println("CRITICAL ALERT: Global ledger balance drift detected. wallet.balance != SUM(ledger_entries.amount)")
	} else {
		log.Println("Audit passed: System is perfectly reconciled.")
	}
}
