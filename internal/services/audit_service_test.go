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

	// ReconcileAll runs in a single MVCC statement snapshot, guaranteeing consistent read
	reconciled, err := auditService.ReconcileAll(ctx)
	if err != nil {
		t.Fatalf("unexpected error running audit: %v", err)
	}
	if !reconciled {
		t.Fatal("expected system to be reconciled on atomic snapshot")
	}
}
