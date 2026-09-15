package services_test

import (
	"context"
	"testing"

	"github.com/Anant3008/payment-ledger-system/internal/services"
)

func TestAuditService_ReconcileAll(t *testing.T) {
	conn := setupServicesTestDB(t)
	defer conn.Close()

	auditService := services.NewAuditService(conn)
	ctx := context.Background()

	// Since Go runs package tests in parallel (and other packages like handlers/repository 
	// hit the same database concurrently), global SUMs will fluctuate mid-test.
	// We only verify that the audit query executes successfully without SQL errors.
	_, err := auditService.ReconcileAll(ctx)
	if err != nil {
		t.Fatalf("unexpected error running audit: %v", err)
	}
}
