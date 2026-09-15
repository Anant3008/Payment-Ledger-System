CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  request_path VARCHAR(255) NOT NULL,
  response_code INT,
  response_body JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'started',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
