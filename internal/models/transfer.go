package models

import "context"

// TransferJob represents a single transfer intent waiting to be batched.
// It includes a channel so the background worker can communicate the result
// back to the specific HTTP request goroutine.
type TransferJob struct {
	FromWalletID int
	ToWalletID   int
	Amount       int64
	Ctx          context.Context
	ResultChan   chan error
}
