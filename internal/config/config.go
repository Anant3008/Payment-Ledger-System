package config

import (
    "os"
    "strings"

    "github.com/joho/godotenv"
)

// Config holds application configuration values.
type Config struct {
    DatabaseURL string
    Port        string
}

// Load reads environment variables (and .env) and returns a Config.
func Load() Config {
    _ = godotenv.Load()

    return Config{
        DatabaseURL: getenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/payment_ledger?sslmode=disable"),
        Port:        getenv("PORT", "8080"),
    }
}

func getenv(key, fallback string) string {
    if v := strings.TrimSpace(os.Getenv(key)); v != "" {
        return v
    }
    return fallback
}
