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

// ReconcileAll audits the entire system in a single transactional MVCC statement snapshot
// to ensure the sum of all wallet balances exactly matches the sum of all ledger entries.
func (s *AuditService) ReconcileAll(ctx context.Context) (bool, error) {
	query := `
		SELECT
			(SELECT COALESCE(SUM(balance), 0) FROM wallets) =
			(SELECT COALESCE(SUM(amount), 0) FROM ledger_entries)
	`
	var isReconciled bool
	if err := s.db.GetContext(ctx, &isReconciled, query); err != nil {
		return false, fmt.Errorf("audit query failed: %w", err)
	}

	return isReconciled, nil
}
