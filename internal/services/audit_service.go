package services

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
)

type AuditService struct {
	db *sqlx.DB
}

func NewAuditService(db *sqlx.DB) *AuditService {
	return &AuditService{db: db}
}

// ReconcileAll audits the entire system to ensure the sum of all wallet balances
// exactly matches the sum of all ledger entries.
func (s *AuditService) ReconcileAll(ctx context.Context) (bool, error) {
	var totalBalances int64
	var totalLedger int64

	if err := s.db.GetContext(ctx, &totalBalances, "SELECT COALESCE(SUM(balance), 0) FROM wallets"); err != nil {
		return false, fmt.Errorf("audit failed to sum balances: %w", err)
	}

	if err := s.db.GetContext(ctx, &totalLedger, "SELECT COALESCE(SUM(amount), 0) FROM ledger_entries"); err != nil {
		return false, fmt.Errorf("audit failed to sum ledger entries: %w", err)
	}

	return totalBalances == totalLedger, nil
}
