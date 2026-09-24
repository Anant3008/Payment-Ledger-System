#!/usr/bin/env python3
"""
contention_diagnostic.py

Deep diagnostic profiler for the Payment Ledger System to investigate why
hot_wallet and opposing_transfers scenarios exhibit high (~2s) p50 latency at 500 VUs.

Measures the entire transfer lifecycle:
HTTP request -> DB connection acquisition -> transaction start ->
wallet lock acquisition/wait -> wallet updates -> ledger/transaction inserts -> COMMIT -> response.

Reports p50 / p90 / p95 / p99 across all stages in the terminal to determine
whether latency comes from:
1. Connection-pool waiting (Go sql.DB maxOpenConns queue)
2. Row-lock waiting (PostgreSQL SELECT ... FOR UPDATE tuple locks)
3. Database work (balance check + balance updates + ledger inserts)
4. Commit / WAL sync
5. HTTP / network / framework overhead
"""

import os
import sys
import time
import json
import argparse
import tempfile
import subprocess
from datetime import datetime

DIAG_DIR = os.path.dirname(os.path.abspath(__file__))
BENCH_DIR = os.path.abspath(os.path.join(DIAG_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(BENCH_DIR, ".."))
DATA_DIR = os.path.join(BENCH_DIR, "data")
WALLETS_JSON = os.path.join(DATA_DIR, "wallets.json")

# Terminal styling
USE_COLOR = sys.stdout.isatty() or os.environ.get("FORCE_COLOR", "0") == "1"

def c(text, color_code):
    return f"\033[{color_code}m{text}\033[0m" if USE_COLOR else text

BOLD = "1"
CYAN = "36"
GREEN = "32"
YELLOW = "33"
RED = "31"
MAGENTA = "35"
DIM = "2"
BLUE = "34"

def percentile(sorted_list, pct):
    if not sorted_list:
        return 0.0
    idx = int(len(sorted_list) * (pct / 100.0))
    idx = min(idx, len(sorted_list) - 1)
    return round(sorted_list[idx], 2)

def calculate_stats(samples):
    if not samples:
        return {"p50": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0, "avg": 0.0, "max": 0.0}
    s = sorted(samples)
    return {
        "p50": percentile(s, 50),
        "p90": percentile(s, 90),
        "p95": percentile(s, 95),
        "p99": percentile(s, 99),
        "avg": round(sum(s) / len(s), 2),
        "max": round(max(s), 2)
    }

def format_ms(value):
    if value >= 1000:
        return f"{value / 1000:.2f}s"
    return f"{value:.2f}ms"

def check_server(base_url):
    import urllib.request
    try:
        with urllib.request.urlopen(f"{base_url.rstrip('/')}/health", timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False

def setup_data():
    setup_script = os.path.join(BENCH_DIR, "scripts", "setup_data.sh")
    res = subprocess.run([setup_script], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"\n{c('Error during setup_data.sh:', RED)} {res.stderr}")
        sys.exit(1)

# Go micro-benchmark code template to profile in-engine stages with nanosecond precision
GO_STAGE_PROFILER = r'''package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type WalletsConfig struct {
	HotWallet struct {
		SenderID     int   `json:"sender_id"`
		RecipientIDs []int `json:"recipient_ids"`
	} `json:"hot_wallet"`
	Opposing struct {
		WalletA int `json:"wallet_a"`
		WalletB int `json:"wallet_b"`
	} `json:"opposing"`
}

type StageTiming struct {
	ConnWaitMs       float64 `json:"conn_wait_ms"`
	TxBeginMs        float64 `json:"tx_begin_ms"`
	LockWaitMs       float64 `json:"lock_wait_ms"`
	WalletUpdatesMs  float64 `json:"wallet_updates_ms"`
	InsertsMs        float64 `json:"inserts_ms"`
	CommitMs         float64 `json:"commit_ms"`
	TotalDbMs        float64 `json:"total_db_ms"`
}

var firstErrOnce sync.Once

func recordErr(stage string, err error) {
	if err != nil && !strings.Contains(err.Error(), "context deadline exceeded") && !strings.Contains(err.Error(), "context canceled") {
		firstErrOnce.Do(func() {
			fmt.Fprintf(os.Stderr, "Stage '%s' failed: %v\n", stage, err)
		})
	}
}

func main() {
	scenario := flag.String("scenario", "hot_wallet", "Scenario: hot_wallet or opposing_transfers")
	vus := flag.Int("vus", 500, "Concurrent workers")
	durationSec := flag.Int("duration", 10, "Duration in seconds")
	dbURL := flag.String("db", "postgres://postgres:postgres@localhost:5432/payment_ledger?sslmode=disable", "Database URL")
	walletsFile := flag.String("wallets", "benchmarks/data/wallets.json", "Wallets JSON file")
	flag.Parse()

	walletsData, err := os.ReadFile(*walletsFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read wallets file: %v\n", err)
		os.Exit(1)
	}

	var wConf WalletsConfig
	if err := json.Unmarshal(walletsData, &wConf); err != nil {
		fmt.Fprintf(os.Stderr, "failed to parse wallets file: %v\n", err)
		os.Exit(1)
	}

	db, err := sqlx.Open("pgx", *dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db open error: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	// Exactly mirror application pool limits from internal/db/postgres.go
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		fmt.Fprintf(os.Stderr, "db ping error: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*durationSec)*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	resultsChan := make(chan StageTiming, 200000)

	for i := 0; i < *vus; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			r := rand.New(rand.NewSource(time.Now().UnixNano() + int64(workerID)))

			for {
				select {
				case <-ctx.Done():
					return
				default:
				}

				var fromID, toID int
				if *scenario == "hot_wallet" {
					fromID = wConf.HotWallet.SenderID
					recipients := wConf.HotWallet.RecipientIDs
					if len(recipients) == 0 {
						recordErr("hot_wallet setup", fmt.Errorf("no recipients configured in wallets.json"))
						return
					}
					toID = recipients[r.Intn(len(recipients))]
				} else { // opposing_transfers
					if wConf.Opposing.WalletA == 0 || wConf.Opposing.WalletB == 0 {
						recordErr("opposing setup", fmt.Errorf("opposing wallets not configured in wallets.json"))
						return
					}
					if r.Intn(2) == 0 {
						fromID = wConf.Opposing.WalletA
						toID = wConf.Opposing.WalletB
					} else {
						fromID = wConf.Opposing.WalletB
						toID = wConf.Opposing.WalletA
					}
				}

				timing := executeTimedTransfer(ctx, db, fromID, toID)
				if timing != nil {
					select {
					case resultsChan <- *timing:
					default:
					}
				}
			}
		}(i)
	}

	wg.Wait()
	close(resultsChan)

	var allTimings []StageTiming
	for t := range resultsChan {
		allTimings = append(allTimings, t)
	}

	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(allTimings); err != nil {
		fmt.Fprintf(os.Stderr, "failed to encode output: %v\n", err)
		os.Exit(1)
	}
}

func executeTimedTransfer(ctx context.Context, db *sqlx.DB, fromWalletID, toWalletID int) *StageTiming {
	// 1. Stage: DB connection acquisition from pool
	t0 := time.Now()
	conn, err := db.Connx(ctx)
	if err != nil {
		recordErr("db.Connx", err)
		return nil
	}
	defer conn.Close()
	tConn := time.Since(t0)

	// 2. Stage: Transaction Start (BEGIN)
	t1 := time.Now()
	tx, err := conn.BeginTxx(ctx, nil)
	if err != nil {
		recordErr("conn.BeginTxx", err)
		return nil
	}
	defer tx.Rollback()
	tBegin := time.Since(t1)

	// 3. Stage: Wallet Lock Acquisition / Wait (Deterministic ID ordering)
	firstID, secondID := fromWalletID, toWalletID
	if firstID > secondID {
		firstID, secondID = secondID, firstID
	}

	t2 := time.Now()
	var dummy int
	if err := tx.GetContext(ctx, &dummy, "SELECT id FROM wallets WHERE id=$1 FOR UPDATE", firstID); err != nil {
		recordErr(fmt.Sprintf("lock wallet %d", firstID), err)
		return nil
	}
	if err := tx.GetContext(ctx, &dummy, "SELECT id FROM wallets WHERE id=$1 FOR UPDATE", secondID); err != nil {
		recordErr(fmt.Sprintf("lock wallet %d", secondID), err)
		return nil
	}
	tLock := time.Since(t2)

	// 4. Stage: Balance check + balance updates
	t3 := time.Now()
	var currentBalance int64
	if err := tx.GetContext(ctx, &currentBalance, "SELECT balance FROM wallets WHERE id=$1", fromWalletID); err != nil {
		recordErr("balance check", err)
		return nil
	}
	if currentBalance < 1 {
		recordErr("insufficient balance", fmt.Errorf("wallet %d balance %d < 1", fromWalletID, currentBalance))
		return nil
	}
	if _, err := tx.ExecContext(ctx, "UPDATE wallets SET balance = balance - 1 WHERE id = $1", fromWalletID); err != nil {
		recordErr("update sender balance", err)
		return nil
	}
	if _, err := tx.ExecContext(ctx, "UPDATE wallets SET balance = balance + 1 WHERE id = $1", toWalletID); err != nil {
		recordErr("update receiver balance", err)
		return nil
	}
	tUpdates := time.Since(t3)

	// 5. Stage: Transaction and ledger entry inserts
	t4 := time.Now()
	var txID int
	if err := tx.QueryRowxContext(ctx, "INSERT INTO transactions (wallet_id, amount, type, status) VALUES ($1, 1, 'transfer', 'completed') RETURNING id", fromWalletID).Scan(&txID); err != nil {
		recordErr("insert transaction", err)
		return nil
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO ledger_entries (transaction_id, wallet_id, amount) VALUES ($1, $2, -1), ($1, $3, 1)", txID, fromWalletID, toWalletID); err != nil {
		recordErr("insert ledger entries", err)
		return nil
	}
	tInserts := time.Since(t4)

	// 6. Stage: Commit & WAL Flush
	t5 := time.Now()
	if err := tx.Commit(); err != nil {
		recordErr("commit tx", err)
		return nil
	}
	tCommit := time.Since(t5)

	totalDb := tConn + tBegin + tLock + tUpdates + tInserts + tCommit

	return &StageTiming{
		ConnWaitMs:      float64(tConn.Microseconds()) / 1000.0,
		TxBeginMs:       float64(tBegin.Microseconds()) / 1000.0,
		LockWaitMs:      float64(tLock.Microseconds()) / 1000.0,
		WalletUpdatesMs: float64(tUpdates.Microseconds()) / 1000.0,
		InsertsMs:       float64(tInserts.Microseconds()) / 1000.0,
		CommitMs:        float64(tCommit.Microseconds()) / 1000.0,
		TotalDbMs:       float64(totalDb.Microseconds()) / 1000.0,
	}
}
'''

def run_http_benchmark(scenario, vus, duration, base_url):
    """Runs k6 contention_test.js to capture real HTTP request/response metrics."""
    script_path = os.path.join(DIAG_DIR, "contention_test.js")
    fd, summary_path = tempfile.mkstemp(prefix=f"k6_diag_{scenario}_", suffix=".json")
    os.close(fd)

    cmd = [
        "k6", "run",
        "--vus", str(vus),
        "--duration", duration,
        "--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)",
        "--summary-export", summary_path,
        "-e", f"VUS={vus}",
        "-e", f"DURATION={duration}",
        "-e", f"SCENARIO={scenario}",
        "-e", f"BASE_URL={base_url}",
        script_path
    ]

    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        with open(summary_path, "r") as f:
            data = json.load(f)
    except Exception as e:
        data = {}
    finally:
        if os.path.exists(summary_path):
            os.remove(summary_path)

    metrics = data.get("metrics", {})
    dur_data = metrics.get("http_req_duration", {})
    values = dur_data.get("values", dur_data)
    req_data = metrics.get("http_reqs", {})
    req_values = req_data.get("values", req_data)

    return {
        "http_p50": round(values.get("med", 0.0), 2),
        "http_p90": round(values.get("p(90)", 0.0), 2),
        "http_p95": round(values.get("p(95)", 0.0), 2),
        "http_p99": round(values.get("p(99)", 0.0), 2),
        "http_avg": round(values.get("avg", 0.0), 2),
        "http_max": round(values.get("max", 0.0), 2),
        "http_rps": round(req_values.get("rate", 0.0), 2)
    }

def run_lifecycle_profiler(scenario, vus, duration_sec, db_url):
    """Runs the stage profiler inside the repository tree to measure exact lifecycle stages under concurrency."""
    go_path = os.path.join(DIAG_DIR, "stage_profiler_runner.go")
    with open(go_path, "w") as f:
        f.write(GO_STAGE_PROFILER)

    cmd = [
        "go", "run", go_path,
        "-scenario", scenario,
        "-vus", str(vus),
        "-duration", str(duration_sec),
        "-db", db_url,
        "-wallets", WALLETS_JSON
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT)
        if proc.returncode != 0:
            print(f"\n{c('[Profiler Error (code ' + str(proc.returncode) + ')]:', RED)} {proc.stderr.strip()}")
            return None
        if proc.stderr.strip():
            print(f"\n{c('[Profiler Note]:', YELLOW)} {proc.stderr.strip()}")
        timings = json.loads(proc.stdout)
    except Exception as e:
        print(f"\n{c('[Profiler Execution Error]:', RED)} {e}")
        return None
    finally:
        if os.path.exists(go_path):
            os.remove(go_path)

    if not timings:
        print(f"\n{c('[Profiler Warning]:', YELLOW)} No transfer timings were collected during the profiling window.")
        return None

    conn_waits = [t["conn_wait_ms"] for t in timings]
    tx_begins = [t["tx_begin_ms"] for t in timings]
    lock_waits = [t["lock_wait_ms"] for t in timings]
    wallet_updates = [t["wallet_updates_ms"] for t in timings]
    inserts = [t["inserts_ms"] for t in timings]
    commits = [t["commit_ms"] for t in timings]
    total_dbs = [t["total_db_ms"] for t in timings]

    return {
        "samples_count": len(timings),
        "conn_pool_wait": calculate_stats(conn_waits),
        "tx_begin": calculate_stats(tx_begins),
        "lock_wait": calculate_stats(lock_waits),
        "wallet_updates": calculate_stats(wallet_updates),
        "ledger_inserts": calculate_stats(inserts),
        "commit_wal": calculate_stats(commits),
        "total_db": calculate_stats(total_dbs)
    }

def print_diagnostic_breakdown(scenario, vus, http_stats, db_stats):
    w = 112
    print("\n" + c("╔" + "═" * (w - 2) + "╗", CYAN))
    title = f"DIAGNOSTIC LATENCY BREAKDOWN: {scenario.upper()} @ {vus} VUs"
    print(c("║" + title.center(w - 2) + "║", CYAN))
    print(c("╚" + "═" * (w - 2) + "╝", CYAN))

    print(f"  {c('HTTP End-to-End Throughput:', BOLD):<32} {http_stats.get('http_rps', 0):.2f} req/s")
    print(f"  {c('HTTP End-to-End Latency:', BOLD):<32} p50: {format_ms(http_stats.get('http_p50', 0))} │ p95: {format_ms(http_stats.get('http_p95', 0))} │ p99: {format_ms(http_stats.get('http_p99', 0))}")
    print(f"  {c('Profiled Database Transactions:', BOLD):<32} {db_stats['samples_count']} operations")
    print(c("─" * w, DIM))

    stages = [
        ("1. DB Connection Pool Wait", "conn_pool_wait", "Waiting in Go sql.DB queue for 1 of 10 connections"),
        ("2. Transaction Start (BEGIN)", "tx_begin", "Executing BEGIN on acquired connection"),
        ("3. Row-Lock Acquisition", "lock_wait", "Blocked on SELECT ... FOR UPDATE (Hot row queue)"),
        ("4. Balance Check & Updates", "wallet_updates", "Balance verification and 2x UPDATE wallets SET"),
        ("5. Ledger & Tx Inserts", "ledger_inserts", "INSERT INTO transactions + 2x ledger_entries"),
        ("6. COMMIT & WAL Sync", "commit_wal", "fsync / WAL persistence flush to disk"),
        ("Total In-Database Lifecycle", "total_db", "Sum of all in-database lifecycle operations")
    ]

    total_avg = db_stats["total_db"]["avg"] or 1.0

    print(c("┌──────────────────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬───────────┐", BOLD))
    print(
        f"{c('│', BOLD)} {c('Transfer Lifecycle Stage', BOLD):<32} {c('│', BOLD)} "
        f"{c('p50', BOLD):>8} {c('│', BOLD)} {c('p90', BOLD):>8} {c('│', BOLD)} "
        f"{c('p95', BOLD):>8} {c('│', BOLD)} {c('p99', BOLD):>8} {c('│', BOLD)} "
        f"{c('Avg', BOLD):>8} {c('│', BOLD)} {c('% Total', BOLD):>9} {c('│', BOLD)}"
    )
    print(c("├──────────────────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼───────────┤", BOLD))

    for label, key, desc in stages:
        s = db_stats[key]
        pct = (s["avg"] / total_avg) * 100 if key != "total_db" else 100.0

        p50_fmt = format_ms(s["p50"])
        p95_fmt = format_ms(s["p95"])
        p99_fmt = format_ms(s["p99"])
        avg_fmt = format_ms(s["avg"])
        pct_fmt = f"{pct:.1f}%"

        is_high = s["p50"] > 500 or pct > 30

        if is_high and key != "total_db":
            p50_fmt = c(p50_fmt, RED)
            pct_fmt = c(pct_fmt, RED)

        is_subtotal = (key == "total_db")
        if is_subtotal:
            print(c("├──────────────────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼───────────┤", BOLD))
            print(
                f"{c('│', BOLD)} {c(label, BOLD):<32} {c('│', BOLD)} "
                f"{c(p50_fmt, BOLD):>8} {c('│', BOLD)} {c(format_ms(s['p90']), BOLD):>8} {c('│', BOLD)} "
                f"{c(p95_fmt, BOLD):>8} {c('│', BOLD)} {c(p99_fmt, BOLD):>8} {c('│', BOLD)} "
                f"{c(avg_fmt, BOLD):>8} {c('│', BOLD)} {c(pct_fmt, BOLD):>9} {c('│', BOLD)}"
            )
        else:
            print(
                f"{c('│', BOLD)} {label:<32} {c('│', BOLD)} "
                f"{p50_fmt:>8} {c('│', BOLD)} {format_ms(s['p90']):>8} {c('│', BOLD)} "
                f"{p95_fmt:>8} {c('│', BOLD)} {p99_fmt:>8} {c('│', BOLD)} "
                f"{avg_fmt:>8} {c('│', BOLD)} {pct_fmt:>9} {c('│', BOLD)}"
            )

    print(c("└──────────────────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴───────────┘", BOLD))

    # Analytical Diagnosis
    pool_pct = (db_stats["conn_pool_wait"]["avg"] / total_avg) * 100
    lock_pct = (db_stats["lock_wait"]["avg"] / total_avg) * 100
    work_pct = ((db_stats["wallet_updates"]["avg"] + db_stats["ledger_inserts"]["avg"]) / total_avg) * 100
    commit_pct = (db_stats["commit_wal"]["avg"] / total_avg) * 100

    print("\n" + c("┌" + "─" * (w - 2) + "┐", YELLOW))
    print(c("│", YELLOW) + c(" DIAGNOSTIC ANALYSIS & ROOT-CAUSE DETERMINATION", BOLD).ljust(w - 2) + c("│", YELLOW))
    print(c("├" + "─" * (w - 2) + "┤", YELLOW))

    print(f"{c('│', YELLOW)}  • Connection Pool Wait (Go maxOpenConns=10):  {pool_pct:>5.1f}% of total DB latency")
    print(f"{c('│', YELLOW)}  • Row-Lock Wait (SELECT FOR UPDATE tuple):    {lock_pct:>5.1f}% of total DB latency")
    print(f"{c('│', YELLOW)}  • Pure Database Work (Updates & Inserts):     {work_pct:>5.1f}% of total DB latency")
    print(f"{c('│', YELLOW)}  • Commit & Write-Ahead Logging (WAL sync):    {commit_pct:>5.1f}% of total DB latency")
    print(c("├" + "─" * (w - 2) + "┤", YELLOW))

    if pool_pct > 50 and lock_pct > 20:
        verdict = "DUAL BOTTLENECK (Row-Lock Serialization holding Connection Pool):"
        explanation = (
            "Because transfers lock the hot wallet row, the 10 active connections quickly queue up on PostgreSQL row locks.\n"
            "  While waiting for the row lock, each transaction holds onto its database connection, starving the remaining\n"
            "  490 incoming HTTP requests in Go's in-memory connection pool queue."
        )
    elif pool_pct > 60:
        verdict = "CONNECTION POOL SATURATION:"
        explanation = "Requests spend the overwhelming majority of time blocked waiting for 1 of the 10 database connections."
    elif lock_pct > 60:
        verdict = "ROW-LEVEL LOCK CONTENTION:"
        explanation = "Requests acquire database connections quickly, but block inside PostgreSQL waiting for exclusive row locks."
    else:
        verdict = "DISTRIBUTED DELAY:"
        explanation = "Latency is split across network, connection pool, and lock acquisition."

    print(f"{c('│', YELLOW)}  {c('Verdict:', BOLD)} {c(verdict, CYAN)}")
    for line in explanation.split("\n"):
        print(f"{c('│', YELLOW)}  {line}")
    print(c("└" + "─" * (w - 2) + "┘\n", YELLOW))

def main():
    parser = argparse.ArgumentParser(description="Payment Ledger Transfer Lifecycle Contention Diagnostics")
    parser.add_argument("--name", default="contention_diagnostic", help="Experiment name (default: contention_diagnostic)")
    parser.add_argument("--purpose", default=None, help="Hypothesis / purpose description for experiment log")
    parser.add_argument("--observation", default=None, help="Observation notes for experiment log")
    parser.add_argument("--next-step", default=None, help="Next steps for experiment log")
    parser.add_argument("--no-track", action="store_true", help="Disable automatic recording in experiment tracker")
    parser.add_argument("--scenarios", default="hot_wallet,opposing_transfers", help="Comma-separated scenarios: hot_wallet,opposing_transfers or 'all'")
    parser.add_argument("--vus", type=int, default=500, help="Concurrency level to diagnose (default: 500)")
    parser.add_argument("--duration", default="12s", help="Duration per test (default: 12s)")
    parser.add_argument("--base-url", default="http://localhost:8080", help="HTTP API base URL")
    parser.add_argument("--db-url", default="postgres://postgres:postgres@localhost:5432/payment_ledger?sslmode=disable", help="Database connection URL")
    args = parser.parse_args()

    dur_sec = int(args.duration.rstrip("s")) if args.duration.endswith("s") else int(args.duration)

    scenario_aliases = {
        "hot": "hot_wallet",
        "hot_wallet": "hot_wallet",
        "hot_wallets": "hot_wallet",
        "opposing": "opposing_transfers",
        "opposing_transfer": "opposing_transfers",
        "opposing_transfers": "opposing_transfers",
        "opposing_transaction": "opposing_transfers",
        "opposing_transactions": "opposing_transfers",
    }

    if args.scenarios == "all":
        scenarios = ["hot_wallet", "opposing_transfers"]
    else:
        raw_list = [s.strip().lower().replace("-", "_") for s in args.scenarios.split(",") if s.strip()]
        scenarios = []
        for s in raw_list:
            norm = scenario_aliases.get(s)
            if not norm:
                print(c(f"Error: Unknown scenario '{s}'. Available: hot_wallet, opposing_transfers", RED))
                sys.exit(1)
            if norm not in scenarios:
                scenarios.append(norm)

    print(c("\n╔══════════════════════════════════════════════════════════════════════════════════════════════╗", CYAN))
    print(c("║                  TRANSFER LIFECYCLE & CONTENTION DIAGNOSTIC PROFILER                         ║", CYAN))
    print(c("╚══════════════════════════════════════════════════════════════════════════════════════════════╝", CYAN))
    print(f"  Target Concurrency:    {c(str(args.vus) + ' VUs', BOLD)}")
    print(f"  Test Duration:         {args.duration}")
    print(f"  Scenarios:             {', '.join(scenarios)}")
    print(f"  API Base URL:          {args.base_url}")
    print(f"  DB URL:                {args.db_url}")
    print(c("─" * 96, DIM))

    print(f"  {c('Checking API readiness...', DIM)} ", end="", flush=True)
    if not check_server(args.base_url):
        print(c("FAILED", RED))
        print(f"{c('ERROR:', RED)} Server unreachable at {args.base_url}. Start containers with `docker compose up -d`.")
        sys.exit(1)
    print(c("READY ✓", GREEN))

    print(f"  {c('Provisioning test wallets...', DIM)} ", end="", flush=True)
    setup_data()
    print(c("DONE ✓", GREEN))
    print(c("─" * 96, DIM))

    diagnostic_results = {}

    for sc in scenarios:
        print(f"\n{c('>>> Profiling Scenario: ' + sc.upper(), BOLD)}")

        # Step 1: HTTP end-to-end benchmark
        print(f"  {c('1/2 Running HTTP load test via k6 contention_test.js (' + str(args.vus) + ' VUs)...', DIM)} ", end="", flush=True)
        http_stats = run_http_benchmark(sc, args.vus, args.duration, args.base_url)
        print(c("DONE ✓", GREEN))

        # Step 2: In-engine lifecycle stage profiling
        print(f"  {c('2/2 Profiling transfer lifecycle stages (' + str(args.vus) + ' workers, pool=10)...', DIM)} ", end="", flush=True)
        db_stats = run_lifecycle_profiler(sc, args.vus, dur_sec, args.db_url)
        if not db_stats:
            print(c("FAILED", RED))
            continue
        print(c("DONE ✓", GREEN))

        diagnostic_results[sc] = {"http": http_stats, "db": db_stats}
        print_diagnostic_breakdown(sc, args.vus, http_stats, db_stats)

    print(c("Diagnostics run completed successfully.\n", GREEN))

    if not args.no_track and diagnostic_results:
        try:
            sys.path.insert(0, os.path.dirname(DIAG_DIR))
            from experiments.tracker import record_diagnostic_experiment
            record_diagnostic_experiment(
                name=args.name,
                config={
                    "vus": args.vus,
                    "duration": args.duration,
                    "scenarios": scenarios,
                    "base_url": args.base_url,
                },
                diagnostic_results=diagnostic_results,
                purpose=args.purpose,
                observation=args.observation,
                next_step=args.next_step,
            )
        except Exception as e:
            print(f"  {c('⚠ Note:', YELLOW)} Experiment tracking notice: {e}")

if __name__ == "__main__":
    main()
