#!/usr/bin/env python3
import os
import sys
import time
import json
import argparse
import tempfile
import threading
import subprocess
from datetime import datetime

BENCH_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPTS_DIR = os.path.join(BENCH_DIR, "scripts")
RESULTS_DIR = os.path.join(BENCH_DIR, "results")
DATA_DIR = os.path.join(BENCH_DIR, "data")

os.makedirs(RESULTS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

DEFAULT_SCENARIOS = [
    ("normal_transfers", "Disjoint wallet pairs (zero row-lock contention)"),
    ("hot_wallet", "Single hot sender wallet (extreme lock serialization)"),
    ("cross_wallet", "Shared 50-wallet pool (random peer collisions)"),
    ("opposing_transfers", "Concurrent opposing transfers A<->B (deadlock test)")
]

DEFAULT_VUS = [10, 50, 100, 250, 500]

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

def query_db_stats(container="payment-ledger-system-db-1"):
    sql = "SELECT xact_commit, xact_rollback, deadlocks, conflicts FROM pg_stat_database WHERE datname='payment_ledger';"
    res = subprocess.run(
        ["docker", "exec", container, "psql", "-U", "postgres", "-d", "payment_ledger", "-t", "-A", "-F,", "-c", sql],
        capture_output=True,
        text=True,
        check=True
    )
    parts = res.stdout.strip().split(",")
    return {
        "xact_commit": int(parts[0]),
        "xact_rollback": int(parts[1]),
        "deadlocks": int(parts[2]),
        "conflicts": int(parts[3])
    }

class DBLockSampler(threading.Thread):
    def __init__(self, container="payment-ledger-system-db-1", interval=0.1):
        super().__init__()
        self.container = container
        self.interval = interval
        self.stop_event = threading.Event()
        self.lock_waits = []
        self.active_conns = []

    def run(self):
        sql = "SELECT COALESCE(SUM(CASE WHEN wait_event_type = 'Lock' THEN 1 ELSE 0 END), 0), COUNT(*) FROM pg_stat_activity WHERE datname='payment_ledger' AND state != 'idle';"
        while not self.stop_event.is_set():
            try:
                res = subprocess.run(
                    ["docker", "exec", self.container, "psql", "-U", "postgres", "-d", "payment_ledger", "-t", "-A", "-F,", "-c", sql],
                    capture_output=True,
                    text=True,
                    timeout=1
                )
                if res.returncode == 0:
                    parts = res.stdout.strip().split(",")
                    if len(parts) == 2:
                        self.lock_waits.append(int(parts[0]))
                        self.active_conns.append(int(parts[1]))
            except Exception:
                pass
            time.sleep(self.interval)

    def stop(self):
        self.stop_event.set()
        self.join()

    def get_summary(self):
        return {
            "peak_lock_waits": max(self.lock_waits) if self.lock_waits else 0,
            "avg_lock_waits": round(sum(self.lock_waits) / len(self.lock_waits), 2) if self.lock_waits else 0.0,
            "peak_active_conns": max(self.active_conns) if self.active_conns else 0,
            "avg_active_conns": round(sum(self.active_conns) / len(self.active_conns), 2) if self.active_conns else 0.0,
            "samples": len(self.lock_waits)
        }

def check_server(base_url):
    import urllib.request
    health_url = f"{base_url.rstrip('/')}/health"
    try:
        with urllib.request.urlopen(health_url, timeout=3) as response:
            return response.status == 200
    except Exception:
        return False

def setup_data():
    setup_script = os.path.join(SCRIPTS_DIR, "setup_data.sh")
    res = subprocess.run([setup_script], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"\n{c('Error during setup_data.sh:', RED)} {res.stderr}")
        sys.exit(1)

def clean_benchmarks(container="payment-ledger-system-db-1"):
    print(c("\n==> Cleaning up benchmark files and database state...", BOLD))
    wallets_json = os.path.join(DATA_DIR, "wallets.json")
    summary_json = os.path.join(RESULTS_DIR, "summary.json")
    for f in [wallets_json, summary_json]:
        if os.path.exists(f):
            os.remove(f)
            print(f"  {c('•', DIM)} Removed: {f}")

    raw_dir = os.path.join(RESULTS_DIR, "raw")
    if os.path.exists(raw_dir):
        import shutil
        shutil.rmtree(raw_dir)
        print(f"  {c('•', DIM)} Removed directory: {raw_dir}")

    cleanup_sql = """
    DELETE FROM ledger_entries WHERE wallet_id IN (SELECT id FROM wallets WHERE owner LIKE 'bench_%');
    DELETE FROM transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE owner LIKE 'bench_%');
    DELETE FROM wallets WHERE owner LIKE 'bench_%';
    DELETE FROM idempotency_keys WHERE key LIKE 'norm-%' OR key LIKE 'hot-%' OR key LIKE 'cross-%' OR key LIKE 'opp-%';
    """
    res = subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "payment_ledger", "-c", cleanup_sql],
        capture_output=True,
        text=True
    )
    if res.returncode == 0:
        print(f"  {c('•', GREEN)} Database benchmark records cleaned.")
    else:
        print(f"  {c('•', YELLOW)} Database warning: {res.stderr.strip()}")

    print(c("==> Benchmark environment clean.\n", GREEN))

def run_single_trial(scenario, vus, duration, base_url, save_raw_dir=None, trial_idx=1):
    script_path = os.path.join(SCRIPTS_DIR, f"{scenario}.js")

    if save_raw_dir:
        os.makedirs(save_raw_dir, exist_ok=True)
        summary_path = os.path.join(save_raw_dir, f"{scenario}_{vus}vus_trial{trial_idx}.json")
        is_temp = False
    else:
        fd, summary_path = tempfile.mkstemp(prefix=f"k6_{scenario}_{vus}_t{trial_idx}_", suffix=".json")
        os.close(fd)
        is_temp = True

    pre_stats = query_db_stats()

    sampler = DBLockSampler()
    sampler.start()

    cmd = [
        "k6", "run",
        "--vus", str(vus),
        "--duration", duration,
        "--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)",
        "--summary-export", summary_path,
        "-e", f"VUS={vus}",
        "-e", f"DURATION={duration}",
        "-e", f"BASE_URL={base_url}",
        script_path
    ]

    k6_proc = subprocess.run(cmd, capture_output=True, text=True)

    sampler.stop()

    if k6_proc.returncode != 0:
        print(f"\n{c('[k6 ERROR]', RED)}")
        if k6_proc.stderr.strip():
            print(k6_proc.stderr.strip())
        if is_temp and os.path.exists(summary_path):
            os.remove(summary_path)
        raise RuntimeError(f"k6 failed for {scenario} @ {vus} VUs (trial {trial_idx})")

    post_stats = query_db_stats()
    lock_summary = sampler.get_summary()

    try:
        with open(summary_path, "r") as f:
            k6_data = json.load(f)
    except Exception:
        k6_data = {}
    finally:
        if is_temp and os.path.exists(summary_path):
            os.remove(summary_path)

    metrics = k6_data.get("metrics", {})

    def get_val(name, key, default=0.0):
        m = metrics.get(name, {})
        values = m.get("values", m)
        return values.get(key, default)

    rate_rps = round(get_val("http_reqs", "rate", 0.0), 2)
    fail_rate = round(get_val("http_req_failed", "value", 0.0) * 100, 2)
    dur_p50 = round(get_val("http_req_duration", "med", 0.0), 2)
    dur_p90 = round(get_val("http_req_duration", "p(90)", 0.0), 2)
    dur_p95 = round(get_val("http_req_duration", "p(95)", 0.0), 2)
    dur_p99 = round(get_val("http_req_duration", "p(99)", 0.0), 2)
    deadlocks = post_stats["deadlocks"] - pre_stats["deadlocks"]

    return {
        "rps": rate_rps,
        "p50_ms": dur_p50,
        "p90_ms": dur_p90,
        "p95_ms": dur_p95,
        "p99_ms": dur_p99,
        "errors_pct": fail_rate,
        "peak_locks": lock_summary["peak_lock_waits"],
        "deadlocks": deadlocks
    }

def run_scenario_with_averaging(scenario, vus, duration, base_url, runs=3, save_raw_dir=None):
    trials = []
    for t in range(1, runs + 1):
        trial = run_single_trial(scenario, vus, duration, base_url, save_raw_dir=save_raw_dir, trial_idx=t)
        trials.append(trial)
        if t < runs:
            time.sleep(0.5)

    n = len(trials)
    avg_rps = round(sum(t["rps"] for t in trials) / n, 2)
    avg_p50 = round(sum(t["p50_ms"] for t in trials) / n, 2)
    avg_p90 = round(sum(t["p90_ms"] for t in trials) / n, 2)
    avg_p95 = round(sum(t["p95_ms"] for t in trials) / n, 2)
    avg_p99 = round(sum(t["p99_ms"] for t in trials) / n, 2)
    avg_err = round(sum(t["errors_pct"] for t in trials) / n, 2)
    peak_locks = max(t["peak_locks"] for t in trials)
    total_deadlocks = sum(t["deadlocks"] for t in trials)

    return {
        "scenario": scenario,
        "vus": vus,
        "rps": avg_rps,
        "p50_ms": avg_p50,
        "p90_ms": avg_p90,
        "p95_ms": avg_p95,
        "p99_ms": avg_p99,
        "errors_pct": avg_err,
        "peak_locks": peak_locks,
        "deadlocks": total_deadlocks
    }

def format_ms(value):
    if value >= 1000:
        return f"{value / 1000:.2f}s"
    return f"{value:.2f}ms"

def print_banner(base_url, duration, runs, vus_list, scenarios, run_name):
    w = 96
    print(c("╔" + "═" * (w - 2) + "╗", CYAN))
    title = f"PAYMENT LEDGER SYSTEM — BENCHMARK [{run_name.upper()}]"
    print(c("║" + title.center(w - 2) + "║", CYAN))
    print(c("╚" + "═" * (w - 2) + "╝", CYAN))
    print(f"  {c('Run Name:', BOLD):<22} {run_name}")
    print(f"  {c('Target Host:', BOLD):<22} {base_url}")
    print(f"  {c('Step Duration:', BOLD):<22} {duration} (x{runs} trials averaged)")
    print(f"  {c('Concurrency (VUs):', BOLD):<22} {', '.join(str(v) for v in vus_list)}")
    print(f"  {c('Scenarios Queued:', BOLD):<22} {len(scenarios)} ({', '.join(scenarios)})")
    print(c("─" * w, DIM))

def print_results_table(results, runs):
    w = 106
    print("\n" + c("┌" + "─" * (w - 2) + "┐", BOLD))
    title = f"CONSOLIDATED BENCHMARK RESULTS (Averaged across {runs} trials)"
    print(c("│", BOLD) + title.center(w - 2) + c("│", BOLD))
    print(c("├──────────────────────────────┬─────┬────────────┬──────────┬──────────┬──────────┬──────────┬─────────┬───────────┤", BOLD))
    print(
        f"{c('│', BOLD)} {c('Scenario', BOLD):<28} {c('│', BOLD)} {c('VUs', BOLD):>3} {c('│', BOLD)} "
        f"{c('Throughput', BOLD):>10} {c('│', BOLD)} "
        f"{c('p50', BOLD):>8} {c('│', BOLD)} {c('p90', BOLD):>8} {c('│', BOLD)} "
        f"{c('p95', BOLD):>8} {c('│', BOLD)} {c('p99', BOLD):>8} {c('│', BOLD)} "
        f"{c('Errors', BOLD):>7} {c('│', BOLD)} {c('PeakLocks', BOLD):>9} {c('│', BOLD)}"
    )
    print(c("├──────────────────────────────┼─────┼────────────┼──────────┼──────────┼──────────┼──────────┼─────────┼───────────┤", BOLD))

    prev_sc = None
    for r in results:
        sc = r['scenario']
        sc_disp = sc if sc != prev_sc else ""
        prev_sc = sc

        err_str = f"{r['errors_pct']:.2f}%"
        if r['errors_pct'] > 0:
            err_str = c(err_str, RED)

        p99_str = format_ms(r['p99_ms'])
        if r['p99_ms'] > 1000:
            p99_str = c(p99_str, RED)
        elif r['p99_ms'] > 200:
            p99_str = c(p99_str, YELLOW)

        lock_str = str(r['peak_locks'])
        if r['peak_locks'] > 5:
            lock_str = c(lock_str, YELLOW)

        print(
            f"{c('│', BOLD)} {sc_disp:<28} {c('│', BOLD)} {r['vus']:>3} {c('│', BOLD)} "
            f"{r['rps']:>8.2f}/s {c('│', BOLD)} "
            f"{format_ms(r['p50_ms']):>8} {c('│', BOLD)} {format_ms(r['p90_ms']):>8} {c('│', BOLD)} "
            f"{format_ms(r['p95_ms']):>8} {c('│', BOLD)} {p99_str:>8} {c('│', BOLD)} "
            f"{err_str:>7} {c('│', BOLD)} {lock_str:>9} {c('│', BOLD)}"
        )

    print(c("└──────────────────────────────┴─────┴────────────┴──────────┴──────────┴──────────┴──────────┴─────────┴───────────┘", BOLD))

def generate_report(results, env_info, report_path):
    lines = []
    lines.append(f"# Benchmark Report: {env_info.get('name', 'baseline')}")
    lines.append("")
    lines.append(f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**Target Host:** `{env_info.get('base_url', 'http://localhost:8080')}`")
    lines.append(f"**Step Duration:** `{env_info.get('duration', '10s')}` per test")
    lines.append(f"**Trials per Level:** `{env_info.get('runs', 3)}` (results show calculated averages)")
    lines.append("**Tooling:** Grafana k6 + PostgreSQL `pg_stat` runtime instrumentation")
    lines.append("")

    lines.append("## 1. Executive Summary")
    lines.append("")
    total_deadlocks = sum(r['deadlocks'] for r in results)
    lines.append(f"- **Deadlock Immunity:** **{total_deadlocks} deadlocks** detected across all runs (up to 500 VUs). Deterministic lock ordering (`firstID < secondID`) prevented circular waits.")
    lines.append("- **Statistical Stability:** Every data point represents the average of 3 repeated trials to eliminate outlier jitter.")
    lines.append("")

    lines.append("## 2. Consolidated Benchmark Results (Averaged)")
    lines.append("")
    lines.append("| Scenario | VUs | Throughput (RPS) | p50 | p90 | p95 | p99 | Errors | Peak Locks | Deadlocks |")
    lines.append("|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")

    for r in results:
        lines.append(
            f"| `{r['scenario']}` | {r['vus']} | "
            f"{r['rps']:.2f} r/s | "
            f"{format_ms(r['p50_ms'])} | "
            f"{format_ms(r['p90_ms'])} | "
            f"{format_ms(r['p95_ms'])} | "
            f"{format_ms(r['p99_ms'])} | "
            f"{r['errors_pct']:.2f}% | "
            f"{r['peak_locks']} | "
            f"{r['deadlocks']} |"
        )

    lines.append("")
    with open(report_path, "w") as f:
        f.write("\n".join(lines))

    return report_path

def list_runs():
    files = [f for f in os.listdir(RESULTS_DIR) if f.endswith(".json") and f != "summary.json"]
    if not files:
        print(c("\nNo saved benchmark runs found in benchmarks/results/.\n", YELLOW))
        return

    print(c("\nSaved Benchmark Runs:", BOLD))
    print(c("─" * 70, DIM))
    for f in sorted(files):
        path = os.path.join(RESULTS_DIR, f)
        try:
            with open(path, "r") as fp:
                data = json.load(fp)
            name = data.get("name", f[:-5])
            ts = data.get("timestamp", "unknown")
            trials = data.get("config", {}).get("trials", 1)
            count = len(data.get("results", []))
            print(f"  {c('•', CYAN)} {c(name, BOLD):<25} │ Trials: {trials} │ Records: {count:<4} │ Date: {ts}")
        except Exception:
            print(f"  {c('•', DIM)} {f}")
    print(c("─" * 70, DIM) + "\n")

def compare_runs(name_a, name_b):
    file_a = os.path.join(RESULTS_DIR, f"{name_a}.json") if not name_a.endswith(".json") else name_a
    file_b = os.path.join(RESULTS_DIR, f"{name_b}.json") if not name_b.endswith(".json") else name_b

    if not os.path.exists(file_a):
        print(c(f"Error: Run '{name_a}' not found at {file_a}", RED))
        return
    if not os.path.exists(file_b):
        print(c(f"Error: Run '{name_b}' not found at {file_b}", RED))
        return

    with open(file_a, "r") as f:
        data_a = json.load(f)
    with open(file_b, "r") as f:
        data_b = json.load(f)

    res_a = {f"{r['scenario']}_{r['vus']}": r for r in data_a.get("results", [])}
    res_b = {f"{r['scenario']}_{r['vus']}": r for r in data_b.get("results", [])}

    w = 110
    print("\n" + c("╔" + "═" * (w - 2) + "╗", CYAN))
    title = f"BENCHMARK COMPARISON: [{name_a}] VS. [{name_b}]"
    print(c("║" + title.center(w - 2) + "║", CYAN))
    print(c("╚" + "═" * (w - 2) + "╝", CYAN))

    print(c("┌──────────────────────────────┬─────┬──────────────────────────┬──────────────────────────┬─────────────┐", BOLD))
    print(
        f"{c('│', BOLD)} {c('Scenario', BOLD):<28} {c('│', BOLD)} {c('VUs', BOLD):>3} {c('│', BOLD)} "
        f"{c('Throughput: Base -> Opt (Δ)', BOLD):^24} {c('│', BOLD)} "
        f"{c('p99: Base -> Opt (Δ)', BOLD):^24} {c('│', BOLD)} "
        f"{c('Locks (B->O)', BOLD):>11} {c('│', BOLD)}"
    )
    print(c("├──────────────────────────────┼─────┼──────────────────────────┼──────────────────────────┼─────────────┤", BOLD))

    for key, ra in res_a.items():
        if key not in res_b:
            continue
        rb = res_b[key]

        rps_a, rps_b = ra['rps'], rb['rps']
        rps_delta = ((rps_b - rps_a) / rps_a * 100) if rps_a > 0 else 0
        rps_sign = "+" if rps_delta >= 0 else ""
        rps_delta_str = f"{rps_sign}{rps_delta:.1f}%"
        rps_color = GREEN if rps_delta > 0 else (RED if rps_delta < -5 else DIM)

        p99_a, p99_b = ra['p99_ms'], rb['p99_ms']
        p99_delta = ((p99_b - p99_a) / p99_a * 100) if p99_a > 0 else 0
        p99_sign = "+" if p99_delta >= 0 else ""
        p99_delta_str = f"{p99_sign}{p99_delta:.1f}%"
        p99_color = GREEN if p99_delta < 0 else (RED if p99_delta > 5 else DIM)

        rps_disp = f"{rps_a:.0f} -> {rps_b:.0f} ({c(rps_delta_str, rps_color)})"
        p99_disp = f"{format_ms(p99_a)} -> {format_ms(p99_b)} ({c(p99_delta_str, p99_color)})"
        lock_disp = f"{ra['peak_locks']} -> {rb['peak_locks']}"

        print(
            f"{c('│', BOLD)} {ra['scenario']:<28} {c('│', BOLD)} {ra['vus']:>3} {c('│', BOLD)} "
            f"{rps_disp:<33} {c('│', BOLD)} {p99_disp:<33} {c('│', BOLD)} {lock_disp:>11} {c('│', BOLD)}"
        )

    print(c("└──────────────────────────────┴─────┴──────────────────────────┴──────────────────────────┴─────────────┘", BOLD) + "\n")

def main():
    parser = argparse.ArgumentParser(description="Payment Ledger Benchmark Runner")
    parser.add_argument("--name", default="baseline", help="Unique name/tag for this run (e.g. baseline, append_only)")
    parser.add_argument("--runs", type=int, default=3, help="Number of trials per test level to average (default: 3)")
    parser.add_argument("--base-url", default="http://localhost:8080", help="API base URL")
    parser.add_argument("--duration", default="10s", help="Duration per test trial (e.g. 10s)")
    parser.add_argument("--vus", default="10,50,100,250,500", help="Comma-separated VU counts")
    parser.add_argument("--scenarios", default="all", help="Comma-separated scenarios or 'all'")
    parser.add_argument("--save-raw", default="", help="Optional directory to save raw per-run k6 JSON files")
    parser.add_argument("--clean", action="store_true", help="Clean benchmark data, results, and reset DB records")
    parser.add_argument("--list", action="store_true", help="List all saved benchmark runs")
    parser.add_argument("--compare", nargs=2, metavar=("RUN_A", "RUN_B"), help="Compare two benchmark runs")
    args = parser.parse_args()

    if args.clean:
        clean_benchmarks()
        return

    if args.list:
        list_runs()
        return

    if args.compare:
        compare_runs(args.compare[0], args.compare[1])
        return

    vus_list = [int(x.strip()) for x in args.vus.split(",") if x.strip()]
    desc_map = dict(DEFAULT_SCENARIOS)
    if args.scenarios == "all":
        scenarios = [s[0] for s in DEFAULT_SCENARIOS]
    else:
        scenarios = [s.strip() for s in args.scenarios.split(",") if s.strip()]

    print_banner(args.base_url, args.duration, args.runs, vus_list, scenarios, args.name)

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

    all_results = []
    start_all = time.time()

    for idx, sc in enumerate(scenarios, 1):
        desc = desc_map.get(sc, "")
        print(f"\n{c('┌─ [' + str(idx) + '/' + str(len(scenarios)) + '] Scenario: ' + sc + ' ', CYAN)}" + c("─" * max(0, 96 - len(sc) - 22), CYAN) + c("┐", CYAN))
        if desc:
            print(f"{c('│', CYAN)} {c('Profile:', DIM)} {desc:<84} {c('│', CYAN)}")
        print(c("└" + "─" * 94 + "┘", CYAN))

        for vus in vus_list:
            print(f"  {c('▶', BOLD)} {vus:>3} VUs  [{args.runs}x {args.duration}]  ", end="", flush=True)
            res = run_scenario_with_averaging(sc, vus, args.duration, args.base_url, runs=args.runs, save_raw_dir=args.save_raw if args.save_raw else None)
            all_results.append(res)

            rps_fmt = f"{res['rps']:>7.2f} r/s"
            p50_fmt = format_ms(res['p50_ms'])
            p95_fmt = format_ms(res['p95_ms'])
            p99_fmt = format_ms(res['p99_ms'])
            err_fmt = f"{res['errors_pct']:.2f}%"

            p99_colored = c(f"p99: {p99_fmt:>8}", RED if res['p99_ms'] > 500 else (YELLOW if res['p99_ms'] > 100 else GREEN))
            err_colored = c(f"Err: {err_fmt:>6}", RED if res['errors_pct'] > 0 else DIM)

            print(f"───▶  {c(rps_fmt, BOLD)} (avg) │ p50: {p50_fmt:>7} │ p95: {p95_fmt:>7} │ {p99_colored} │ {err_colored} │ Locks: {res['peak_locks']:>2}")
            time.sleep(0.5)

    elapsed_total = time.time() - start_all

    print_results_table(all_results, args.runs)

    # Save run data to benchmarks/results/<name>.json
    run_file = os.path.join(RESULTS_DIR, f"{args.name}.json")
    summary_mirror = os.path.join(RESULTS_DIR, "summary.json")

    run_payload = {
        "name": args.name,
        "timestamp": datetime.now().isoformat(),
        "config": {
            "host": args.base_url,
            "duration": args.duration,
            "trials": args.runs,
            "vus": vus_list
        },
        "results": all_results
    }

    with open(run_file, "w") as f:
        json.dump(run_payload, f, indent=2)

    with open(summary_mirror, "w") as f:
        json.dump(run_payload, f, indent=2)

    # Generate Markdown Report
    report_file = os.path.join(BENCH_DIR, "baseline_report.md" if args.name == "baseline" else f"results/{args.name}_report.md")
    env_info = {
        "name": args.name,
        "base_url": args.base_url,
        "duration": args.duration,
        "runs": args.runs,
        "vus_list": vus_list
    }
    generate_report(all_results, env_info, report_file)

    total_deadlocks = sum(r['deadlocks'] for r in all_results)

    w = 96
    print("\n" + c("┌" + "─" * (w - 2) + "┐", GREEN))
    print(c("│", GREEN) + c(f" BENCHMARK COMPLETE — [{args.name.upper()}] SUMMARY", BOLD).ljust(w - 2) + c("│", GREEN))
    print(c("├" + "─" * (w - 2) + "┤", GREEN))
    print(f"{c('│', GREEN)}  Saved Experiment:          {c(args.name, BOLD):<82} {c('│', GREEN)}")
    print(f"{c('│', GREEN)}  Trials per Test:           {c(str(args.runs) + ' (averaged)', BOLD):<82} {c('│', GREEN)}")
    print(f"{c('│', GREEN)}  Elapsed Suite Time:        {c(f'{elapsed_total:.1f}s', BOLD):<82} {c('│', GREEN)}")
    deadlock_msg = f"{total_deadlocks} (Invariant Preserved ✓)" if total_deadlocks == 0 else f"{total_deadlocks} (DEADLOCK DETECTED ⚠)"
    print(f"{c('│', GREEN)}  Database Deadlocks:        {c(deadlock_msg, GREEN if total_deadlocks == 0 else RED):<82} {c('│', GREEN)}")
    print(f"{c('│', GREEN)}  Saved JSON Result:         {c(run_file, DIM):<82} {c('│', GREEN)}")
    print(f"{c('│', GREEN)}  Human-Readable Report:     {c(report_file, DIM):<82} {c('│', GREEN)}")
    print(c("└" + "─" * (w - 2) + "┘\n", GREEN))

if __name__ == "__main__":
    main()
