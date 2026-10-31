package main

import (
	"context"
	"log"

	"github.com/Anant3008/payment-ledger-system/internal/config"
	"github.com/Anant3008/payment-ledger-system/internal/db"
)

func main() {
	cfg := config.Load()

	conn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database init failed: %v", err)
	}
	defer conn.Close()

	ctx := context.Background()

	// 1. Check if database already has wallets
	var count int
	if err := conn.GetContext(ctx, &count, "SELECT COUNT(*) FROM wallets"); err != nil {
		log.Fatalf("failed to query wallet count: %v", err)
	}

	if count > 0 {
		log.Printf("Database already contains %d wallets. Skipping demo seed.", count)
		return
	}

	log.Println("Seeding 25 enterprise and individual demo accounts...")

	tx, err := conn.BeginTxx(ctx, nil)
	if err != nil {
		log.Fatalf("failed to begin transaction: %v", err)
	}
	defer tx.Rollback()

	// 2. Insert 25 Wallets
	insertWallets := `
	INSERT INTO wallets (id, owner, balance, created_at) VALUES
	  (1, 'Northwind Treasury', 4300000, NOW() - INTERVAL '14 days'),
	  (2, 'Halcyon Payroll', 2875000, NOW() - INTERVAL '12 days'),
	  (3, 'Meridian Escrow', 1700000, NOW() - INTERVAL '10 days'),
	  (4, 'Acme Ventures', 1050000, NOW() - INTERVAL '9 days'),
	  (5, 'Apex Clearinghouse', 850000, NOW() - INTERVAL '8 days'),
	  (6, 'Helios Capital', 620000, NOW() - INTERVAL '7 days'),
	  (7, 'Vantage Merchant Ops', 480000, NOW() - INTERVAL '6 days'),
	  (8, 'Bluebird Logistics', 310000, NOW() - INTERVAL '5 days'),
	  (9, 'Cascade Design Studio', 435000, NOW() - INTERVAL '5 days'),
	  (10, 'Solaris BioTech', 210000, NOW() - INTERVAL '4 days'),
	  (11, 'Nomad Coffee Roasters', 177500, NOW() - INTERVAL '4 days'),
	  (12, 'Redwood Consulting', 140000, NOW() - INTERVAL '3 days'),
	  (13, 'Alice Chen', 142500, NOW() - INTERVAL '3 days'),
	  (14, 'Bob Martinez', 122000, NOW() - INTERVAL '3 days'),
	  (15, 'Charlie Zhang', 109000, NOW() - INTERVAL '2 days'),
	  (16, 'Diana Prince', 65000, NOW() - INTERVAL '2 days'),
	  (17, 'Ethan Brooks', 58000, NOW() - INTERVAL '2 days'),
	  (18, 'Fiona Gallagher', 49000, NOW() - INTERVAL '1 days'),
	  (19, 'George Vance', 41000, NOW() - INTERVAL '1 days'),
	  (20, 'Hannah Abbott', 36000, NOW() - INTERVAL '1 days'),
	  (21, 'Ian Malcolm', 29000, NOW() - INTERVAL '1 days'),
	  (22, 'Julia Roberts', 24000, NOW() - INTERVAL '1 days'),
	  (23, 'Kevin Flynn', 18000, NOW() - INTERVAL '1 days'),
	  (24, 'Laura Croft', 12000, NOW() - INTERVAL '1 days'),
	  (25, 'Michael Scott', 7500, NOW() - INTERVAL '1 days')
	`
	if _, err := tx.ExecContext(ctx, insertWallets); err != nil {
		log.Fatalf("failed to insert wallets: %v", err)
	}

	if _, err := tx.ExecContext(ctx, "SELECT setval('wallets_id_seq', 25)"); err != nil {
		log.Fatalf("failed to set wallets sequence: %v", err)
	}

	// 3. Insert 33 Transactions (25 initial deposits + 8 transfers)
	insertTxs := `
	INSERT INTO transactions (id, wallet_id, amount, type, status, to_wallet_id, created_at) VALUES
	  (1, 1, 5000000, 'deposit', 'completed', NULL, NOW() - INTERVAL '14 days'),
	  (2, 2, 2500000, 'deposit', 'completed', NULL, NOW() - INTERVAL '12 days'),
	  (3, 3, 1500000, 'deposit', 'completed', NULL, NOW() - INTERVAL '10 days'),
	  (4, 4, 1200000, 'deposit', 'completed', NULL, NOW() - INTERVAL '9 days'),
	  (5, 5, 850000, 'deposit', 'completed', NULL, NOW() - INTERVAL '8 days'),
	  (6, 6, 620000, 'deposit', 'completed', NULL, NOW() - INTERVAL '7 days'),
	  (7, 7, 450000, 'deposit', 'completed', NULL, NOW() - INTERVAL '6 days'),
	  (8, 8, 340000, 'deposit', 'completed', NULL, NOW() - INTERVAL '5 days'),
	  (9, 9, 285000, 'deposit', 'completed', NULL, NOW() - INTERVAL '5 days'),
	  (10, 10, 210000, 'deposit', 'completed', NULL, NOW() - INTERVAL '4 days'),
	  (11, 11, 175000, 'deposit', 'completed', NULL, NOW() - INTERVAL '4 days'),
	  (12, 12, 140000, 'deposit', 'completed', NULL, NOW() - INTERVAL '3 days'),
	  (13, 13, 95000, 'deposit', 'completed', NULL, NOW() - INTERVAL '3 days'),
	  (14, 14, 82000, 'deposit', 'completed', NULL, NOW() - INTERVAL '3 days'),
	  (15, 15, 74000, 'deposit', 'completed', NULL, NOW() - INTERVAL '2 days'),
	  (16, 16, 65000, 'deposit', 'completed', NULL, NOW() - INTERVAL '2 days'),
	  (17, 17, 58000, 'deposit', 'completed', NULL, NOW() - INTERVAL '2 days'),
	  (18, 18, 49000, 'deposit', 'completed', NULL, NOW() - INTERVAL '1 days'),
	  (19, 19, 41000, 'deposit', 'completed', NULL, NOW() - INTERVAL '1 days'),
	  (20, 20, 36000, 'deposit', 'completed', NULL, NOW() - INTERVAL '1 days'),
	  (21, 21, 29000, 'deposit', 'completed', NULL, NOW() - INTERVAL '1 days'),
	  (22, 22, 24000, 'deposit', 'completed', NULL, NOW() - INTERVAL '1 days'),
	  (23, 23, 18000, 'deposit', 'completed', NULL, NOW() - INTERVAL '1 days'),
	  (24, 24, 12000, 'deposit', 'completed', NULL, NOW() - INTERVAL '1 days'),
	  (25, 25, 7500, 'deposit', 'completed', NULL, NOW() - INTERVAL '1 days'),
	  (26, 1, 500000, 'transfer', 'completed', 2, NOW() - INTERVAL '5 days'),
	  (27, 1, 200000, 'transfer', 'completed', 3, NOW() - INTERVAL '4 days'),
	  (28, 4, 150000, 'transfer', 'completed', 9, NOW() - INTERVAL '3 days'),
	  (29, 2, 50000, 'transfer', 'completed', 13, NOW() - INTERVAL '2 days'),
	  (30, 2, 40000, 'transfer', 'completed', 14, NOW() - INTERVAL '2 days'),
	  (31, 2, 35000, 'transfer', 'completed', 15, NOW() - INTERVAL '2 days'),
	  (32, 13, 2500, 'transfer', 'completed', 11, NOW() - INTERVAL '1 days'),
	  (33, 8, 30000, 'transfer', 'completed', 7, NOW() - INTERVAL '1 days')
	`
	if _, err := tx.ExecContext(ctx, insertTxs); err != nil {
		log.Fatalf("failed to insert transactions: %v", err)
	}

	if _, err := tx.ExecContext(ctx, "SELECT setval('transactions_id_seq', 33)"); err != nil {
		log.Fatalf("failed to set transactions sequence: %v", err)
	}

	// 4. Insert 41 Ledger Entries
	insertEntries := `
	INSERT INTO ledger_entries (id, transaction_id, wallet_id, amount, created_at) VALUES
	  (1, 1, 1, 5000000, NOW() - INTERVAL '14 days'),
	  (2, 2, 2, 2500000, NOW() - INTERVAL '12 days'),
	  (3, 3, 3, 1500000, NOW() - INTERVAL '10 days'),
	  (4, 4, 4, 1200000, NOW() - INTERVAL '9 days'),
	  (5, 5, 5, 850000, NOW() - INTERVAL '8 days'),
	  (6, 6, 6, 620000, NOW() - INTERVAL '7 days'),
	  (7, 7, 7, 450000, NOW() - INTERVAL '6 days'),
	  (8, 8, 8, 340000, NOW() - INTERVAL '5 days'),
	  (9, 9, 9, 285000, NOW() - INTERVAL '5 days'),
	  (10, 10, 10, 210000, NOW() - INTERVAL '4 days'),
	  (11, 11, 11, 175000, NOW() - INTERVAL '4 days'),
	  (12, 12, 12, 140000, NOW() - INTERVAL '3 days'),
	  (13, 13, 13, 95000, NOW() - INTERVAL '3 days'),
	  (14, 14, 14, 82000, NOW() - INTERVAL '3 days'),
	  (15, 15, 15, 74000, NOW() - INTERVAL '2 days'),
	  (16, 16, 16, 65000, NOW() - INTERVAL '2 days'),
	  (17, 17, 17, 58000, NOW() - INTERVAL '2 days'),
	  (18, 18, 18, 49000, NOW() - INTERVAL '1 days'),
	  (19, 19, 19, 41000, NOW() - INTERVAL '1 days'),
	  (20, 20, 20, 36000, NOW() - INTERVAL '1 days'),
	  (21, 21, 21, 29000, NOW() - INTERVAL '1 days'),
	  (22, 22, 22, 24000, NOW() - INTERVAL '1 days'),
	  (23, 23, 23, 18000, NOW() - INTERVAL '1 days'),
	  (24, 24, 24, 12000, NOW() - INTERVAL '1 days'),
	  (25, 25, 25, 7500, NOW() - INTERVAL '1 days'),
	  (26, 26, 1, -500000, NOW() - INTERVAL '5 days'),
	  (27, 26, 2, 500000, NOW() - INTERVAL '5 days'),
	  (28, 27, 1, -200000, NOW() - INTERVAL '4 days'),
	  (29, 27, 3, 200000, NOW() - INTERVAL '4 days'),
	  (30, 28, 4, -150000, NOW() - INTERVAL '3 days'),
	  (31, 28, 9, 150000, NOW() - INTERVAL '3 days'),
	  (32, 29, 2, -50000, NOW() - INTERVAL '2 days'),
	  (33, 29, 13, 50000, NOW() - INTERVAL '2 days'),
	  (34, 30, 2, -40000, NOW() - INTERVAL '2 days'),
	  (35, 30, 14, 40000, NOW() - INTERVAL '2 days'),
	  (36, 31, 2, -35000, NOW() - INTERVAL '2 days'),
	  (37, 31, 15, 35000, NOW() - INTERVAL '2 days'),
	  (38, 32, 13, -2500, NOW() - INTERVAL '1 days'),
	  (39, 32, 11, 2500, NOW() - INTERVAL '1 days'),
	  (40, 33, 8, -30000, NOW() - INTERVAL '1 days'),
	  (41, 33, 7, 30000, NOW() - INTERVAL '1 days')
	`
	if _, err := tx.ExecContext(ctx, insertEntries); err != nil {
		log.Fatalf("failed to insert ledger entries: %v", err)
	}

	if _, err := tx.ExecContext(ctx, "SELECT setval('ledger_entries_id_seq', 41)"); err != nil {
		log.Fatalf("failed to set ledger_entries sequence: %v", err)
	}

	if err := tx.Commit(); err != nil {
		log.Fatalf("failed to commit seed transaction: %v", err)
	}

	log.Println("Seed complete: successfully initialized 25 wallets, 33 transactions, and 41 ledger entries ($138,605.00 total volume).")
}
