package services

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	apperrors "github.com/Anant3008/payment-ledger-system/internal/errors"
	"github.com/Anant3008/payment-ledger-system/internal/models"
	"github.com/Anant3008/payment-ledger-system/internal/repository"
)

type TransferService struct {
	transferRepo *repository.TransferRepository
	jobQueue     chan *models.TransferJob
	stopChan     chan struct{}
	wg           sync.WaitGroup
}

func NewTransferService(transferRepo *repository.TransferRepository) *TransferService {
	s := &TransferService{
		transferRepo: transferRepo,
		jobQueue:     make(chan *models.TransferJob, 5000), // Buffer size large enough for traffic spikes
		stopChan:     make(chan struct{}),
	}
	return s
}

// StartBatchWorker boots up the background goroutine that drains the job queue.
// It groups transfers into batches of up to 50 items, or triggers a database
// commit if 2 milliseconds pass, whichever comes first.
func (s *TransferService) StartBatchWorker() {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		slog.Info("Transfer micro-batching worker started")

		const batchSize = 50
		batch := make([]*models.TransferJob, 0, batchSize)
		timer := time.NewTimer(2 * time.Millisecond)
		if !timer.Stop() {
			<-timer.C
		}

		// Helper to flush the current batch to the database
		flush := func() {
			if len(batch) == 0 {
				return
			}
			s.executeBatch(batch)
			// Reset batch
			batch = batch[:0]
		}

		for {
			select {
			case <-s.stopChan:
				// Flush any remaining jobs before shutting down
				flush()
				slog.Info("Transfer micro-batching worker stopped")
				return

			case job := <-s.jobQueue:
				if len(batch) == 0 {
					// Start the flush timer on the first item in a new batch
					timer.Reset(2 * time.Millisecond)
				}
				batch = append(batch, job)

				if len(batch) >= batchSize {
					if !timer.Stop() {
						select {
						case <-timer.C:
						default:
						}
					}
					flush()
				}

			case <-timer.C:
				flush()
			}
		}
	}()
}

// Stop gracefully shuts down the worker, ensuring in-flight items are flushed.
func (s *TransferService) Stop() {
	close(s.stopChan)
	s.wg.Wait()
}

// executeBatch is the internal bridge to the repository. It processes the batch.
// If the batch fails, it falls back to processing each transaction individually
// to filter out the poisoned transfers (e.g. overdrafts), allowing innocent
// transfers to succeed.
func (s *TransferService) executeBatch(batch []*models.TransferJob) {
	fromIDs := make([]int, len(batch))
	toIDs := make([]int, len(batch))
	amounts := make([]int64, len(batch))

	for i, job := range batch {
		fromIDs[i] = job.FromWalletID
		toIDs[i] = job.ToWalletID
		amounts[i] = job.Amount
	}

	err := s.transferRepo.ExecuteBatch(context.Background(), fromIDs, toIDs, amounts)
	if err == nil {
		// Fast path: the entire batch succeeded!
		for _, job := range batch {
			job.ResultChan <- nil
		}
		return
	}

	// Slow path: the batch failed (likely due to one invalid transfer like an overdraft).
	// We must fall back to processing each job individually so innocent transactions
	// do not fail because of someone else's overdraft.
	slog.Warn("batch failed, falling back to sequential execution", "batch_size", len(batch), "error", err)

	for _, job := range batch {
		// Execute sequentially using the existing array layer with length 1
		singleErr := s.transferRepo.ExecuteTransfer(context.Background(), job.FromWalletID, job.ToWalletID, job.Amount)
		job.ResultChan <- singleErr
	}
}

// ProcessTransfer validates business rules and enqueues the transfer intent.
// It blocks until the background worker processes the batch and returns an error.
func (s *TransferService) ProcessTransfer(ctx context.Context, fromWalletID, toWalletID int, amount int64) error {
	if amount <= 0 {
		return fmt.Errorf("amount must be greater than zero: %w", apperrors.ErrInvalidInput)
	}
	if fromWalletID == toWalletID {
		return fmt.Errorf("cannot transfer to self: %w", apperrors.ErrInvalidInput)
	}

	job := &models.TransferJob{
		FromWalletID: fromWalletID,
		ToWalletID:   toWalletID,
		Amount:       amount,
		Ctx:          ctx,
		ResultChan:   make(chan error, 1),
	}

	// Drop intent into the queue
	select {
	case s.jobQueue <- job:
	case <-ctx.Done():
		return ctx.Err()
	}

	// Wait for the background worker to finish the batch and reply
	select {
	case err := <-job.ResultChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}
