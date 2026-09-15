package repository

import (
	"context"
	"errors"

	"github.com/Anant3008/payment-ledger-system/internal/models"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jmoiron/sqlx"
)

type IdempotencyRepository struct {
	db *sqlx.DB
}

func NewIdempotencyRepository(db *sqlx.DB) *IdempotencyRepository {
	return &IdempotencyRepository{db: db}
}

func (r *IdempotencyRepository) TryLock(ctx context.Context, key, path string) (bool, error) {
	query := `INSERT INTO idempotency_keys (key, request_path, status) VALUES ($1, $2, 'started')`
	_, err := r.db.ExecContext(ctx, query, key, path)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // 23505 = unique_violation
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (r *IdempotencyRepository) Get(ctx context.Context, key string) (*models.IdempotencyRecord, error) {
	var record models.IdempotencyRecord
	err := r.db.GetContext(ctx, &record, "SELECT key, request_path, response_code, response_body, status, created_at FROM idempotency_keys WHERE key = $1", key)
	if err != nil {
		return nil, err
	}
	return &record, nil
}

func (r *IdempotencyRepository) Update(ctx context.Context, key string, code int, body []byte) error {
	query := `UPDATE idempotency_keys SET status = 'completed', response_code = $1, response_body = $2 WHERE key = $3`
	_, err := r.db.ExecContext(ctx, query, code, body, key)
	return err
}
