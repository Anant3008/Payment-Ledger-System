# Payment Ledger Benchmark Suite

A reproducible high-concurrency benchmarking suite for the Payment Ledger System using **Grafana k6** and PostgreSQL `pg_stat` instrumentation.

---

## Features

- **Multi-Trial Averaging:** Executes 3 repeated trials per concurrency level by default, averaging RPS and latencies to eliminate statistical noise.
- **Lean Metrics:** Strips away low-signal counters, storing only the 9 essential metrics (`scenario`, `vus`, `rps`, `p50_ms`, `p90_ms`, `p95_ms`, `p99_ms`, `errors_pct`, `peak_locks`, `deadlocks`).
- **Named Experiment Runs:** Save runs by name (`--name baseline`, `--name append_only`) without overwriting previous benchmarks.
- **Built-in Comparison Tool:** Compares any two benchmark runs side-by-side with color-coded deltas (RPS change %, latency reduction %, lock wait drop).
- **Accurate p99 Measurement:** Configured with extended percentile metrics ensuring tail latencies are always precisely measured.

---

## Scenarios Tested

1. **Normal Transfers (`normal_transfers.js`):**
   * Executes transfers across 500 disjoint sender-receiver wallet pairs.
   * Eliminates row-level lock overlap across concurrent requests, isolating pure database connection and network throughput.

2. **Hot-Wallet Contention (`hot_wallet.js`):**
   * Hundreds of concurrent transactions attempt to debit the exact same sender wallet (`bench_hot_sender`).
   * Measures maximum lock serialization latency and throughput collapse under extreme row contention.

3. **Cross-Wallet Transfers (`cross_wallet.js`):**
   * Simulates a multi-user peer-to-peer ecosystem across a shared pool of 50 wallets with random collision rates.

4. **Concurrent Opposing Transfers (`opposing_transfers.js`):**
   * Two wallets, $A$ and $B$, under 50% $A \to B$ and 50% $B \to A$ simultaneous traffic.
   * Empirically stresses the deterministic row locking logic (`firstID < secondID`) to verify zero deadlocks under direct conflict.

---

## How to Run

### 1. Run Baseline (Default: 3 trials averaged per step)
```bash
make benchmark
# or: python3 benchmarks/run_benchmarks.py --name baseline
```

### 2. Run a Named Optimization Experiment
```bash
make benchmark NAME=append_only
# or: python3 benchmarks/run_benchmarks.py --name append_only
```

### 3. Compare Two Experiments
Compare your baseline against an optimization:
```bash
make benchmark-compare A=baseline B=append_only
# or: python3 benchmarks/run_benchmarks.py --compare baseline append_only
```

### 4. List Saved Experiments
```bash
make benchmark-list
# or: python3 benchmarks/run_benchmarks.py --list
```

### 5. Custom Options
```bash
# Single trial for quick debugging
python3 benchmarks/run_benchmarks.py --runs 1 --duration 5s

# Run specific scenarios
python3 benchmarks/run_benchmarks.py --scenarios hot_wallet,opposing_transfers

# Run specific concurrency levels
python3 benchmarks/run_benchmarks.py --vus 10,50,100
```

### 6. Transfer Lifecycle & Contention Diagnostics
Investigate latency bottlenecks (connection pool wait vs row-lock wait vs DB work vs commit/WAL):
```bash
python3 benchmarks/diagnostics/contention_diagnostic.py
```

### 7. Centralized Experiment Tracking
Every benchmark or diagnostic run is automatically logged with numbered sequencing:
* **Log:** `benchmarks/experiments/experiment_log.md` (records hypothesis, config, RPS, p50/p95/p99, errors, diagnostic metrics, observation, next step).
* **Raw Artifacts:** Saved in `benchmarks/experiments/results/{001_name}/`.

```bash
# Optional custom purpose / notes:
python3 benchmarks/run_benchmarks.py --name pool_20 --purpose "Evaluate throughput with maxOpenConns=20"
```

### 8. Clean Up Benchmark Data & State
Resets benchmark database rows and removes temporary test artifacts:
```bash
make benchmark-clean
# or: python3 benchmarks/run_benchmarks.py --clean
```

---

## Directory Structure

```text
benchmarks/
├── README.md               # Execution guide & options reference
├── environment.md          # Hardware, kernel, container, and DB pool specifications
├── baseline_report.md      # Human-readable markdown report (updated automatically)
├── run_benchmarks.py       # Master runner (k6 + DB lock sampler + report generator)
├── run_benchmarks.sh       # Executable wrapper
├── config/
│   ├── config.json         # Scenario descriptions and default VU levels
│   └── seed_wallets.sql    # Clean provisioning SQL with FK indexes & safe timeouts
├── diagnostics/
│   ├── contention_diagnostic.py # Lifecycle profiler for hot-wallet & opposing contention
│   └── contention_test.js       # Diagnostic k6 test reproducing 500 VU contention
├── experiments/
│   ├── experiment_log.md   # Chronological ledger of all benchmark & diagnostic runs
│   ├── tracker.py          # Centralized tracker module
│   └── results/            # Numbered experiment directories (e.g. 001_baseline/)
├── scripts/
│   ├── setup_data.sh       # Provisions benchmark wallets & exports data/wallets.json
│   ├── normal_transfers.js # Scenario 1: Disjoint wallet pairs
│   ├── hot_wallet.js       # Scenario 2: Single hot sender wallet
│   ├── cross_wallet.js     # Scenario 3: Shared 50-wallet pool
│   └── opposing_transfers.js # Scenario 4: Concurrent opposing transfers (A<->B)
└── results/
    ├── <name>.json         # Named experiment JSON (e.g. baseline.json, append_only.json)
    └── summary.json        # Pointer/mirror to the most recent run
```
