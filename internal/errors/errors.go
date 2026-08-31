package errors

import "errors"

// Sentinel domain errors
var (
	ErrNotFound          = errors.New("resource not found")
	ErrInvalidInput      = errors.New("invalid input provided")
	ErrInsufficientFunds = errors.New("insufficient funds for transfer")
	ErrConflict          = errors.New("resource conflict")
	ErrInternal          = errors.New("internal server error")
)
