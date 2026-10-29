package repository

import (
	"context"

	"github.com/Anant3008/payment-ledger-system/internal/models"
	"github.com/jmoiron/sqlx"
)

type IdempotencyRepository struct {
	db *sqlx.DB
}

func NewIdempotencyRepository(db *sqlx.DB) *IdempotencyRepository {
	return &IdempotencyRepository{db: db}
}

func (r *IdempotencyRepository) TryLock(ctx context.Context, key, path, requestHash string) (bool, error) {
	query := `
		INSERT INTO idempotency_keys (key, request_path, request_hash, status, created_at)
		VALUES ($1, $2, $3, 'started', now())
		ON CONFLICT (key) DO UPDATE
			SET request_path = EXCLUDED.request_path,
			    request_hash = EXCLUDED.request_hash,
			    status = 'started',
			    response_code = NULL,
			    response_body = NULL,
			    created_at = now()
		WHERE idempotency_keys.status = 'started'
		  AND idempotency_keys.created_at < now() - INTERVAL '60 seconds'
	`
	res, err := r.db.ExecContext(ctx, query, key, path, requestHash)
	if err != nil {
		return false, err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return rows > 0, nil
}

func (r *IdempotencyRepository) Get(ctx context.Context, key string) (*models.IdempotencyRecord, error) {
	var record models.IdempotencyRecord
	query := `SELECT key, request_path, COALESCE(request_hash, '') as request_hash, response_code, response_body, status, created_at FROM idempotency_keys WHERE key = $1`
	err := r.db.GetContext(ctx, &record, query, key)
	if err != nil {
		return nil, err
	}
	return &record, nil
}

func (r *IdempotencyRepository) Update(ctx context.Context, key string, code int, body []byte) error {
	if len(body) == 0 {
		body = []byte("null")
	}
	query := `UPDATE idempotency_keys SET status = 'completed', response_code = $1, response_body = $2 WHERE key = $3`
	_, err := r.db.ExecContext(ctx, query, code, body, key)
	return err
}

func (r *IdempotencyRepository) Delete(ctx context.Context, key string) error {
	query := `DELETE FROM idempotency_keys WHERE key = $1`
	_, err := r.db.ExecContext(ctx, query, key)
	return err
}

func (r *IdempotencyRepository) SweepExpiredKeys(ctx context.Context, cutoff string) (int64, error) {
	// Deletes keys older than the specified PostgreSQL interval (e.g., '24 hours')
	query := `DELETE FROM idempotency_keys WHERE created_at < now() - $1::interval`
	res, err := r.db.ExecContext(ctx, query, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
