package models

import "time"

type IdempotencyRecord struct {
	Key          string    `db:"key"`
	RequestPath  string    `db:"request_path"`
	ResponseCode *int      `db:"response_code"`
	ResponseBody []byte    `db:"response_body"`
	Status       string    `db:"status"`
	CreatedAt    time.Time `db:"created_at"`
}
