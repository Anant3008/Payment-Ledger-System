package main

import (
	"context"
	"log"
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
	ctx := context.Background()

	log.Println("Starting continuous ledger balance reconciliation worker...")

	for {
		reconciled, err := auditService.ReconcileAll(ctx)
		if err != nil {
			log.Printf("ERROR: Failed to run reconciliation audit: %v", err)
		} else if !reconciled {
			log.Println("CRITICAL ALERT: Global ledger balance drift detected. wallet.balance != SUM(ledger_entries.amount)")
		} else {
			log.Println("Audit passed: System is perfectly reconciled.")
		}

		time.Sleep(1 * time.Minute)
	}
}
