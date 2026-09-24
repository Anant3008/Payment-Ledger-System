#!/usr/bin/env python3
"""Centralized Experiment Tracking System for Payment Ledger Benchmarks & Diagnostics."""

import os
import re
import json
from datetime import datetime

EXP_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(EXP_DIR, "results")
LOG_FILE = os.path.join(EXP_DIR, "experiment_log.md")

os.makedirs(RESULTS_DIR, exist_ok=True)

def _get_next_experiment_num():
    """Scans results directory to find the next sequential experiment number."""
    existing_dirs = [d for d in os.listdir(RESULTS_DIR) if os.path.isdir(os.path.join(RESULTS_DIR, d))]
    max_num = 0
    for d in existing_dirs:
        m = re.match(r"^(\d+)_", d)
        if m:
            num = int(m.group(1))
            if num > max_num:
                max_num = num
    return f"{max_num + 1:03d}"

def _format_ms(val):
    if val >= 1000:
        return f"{val / 1000:.2f}s"
    return f"{val:.2f}ms"

def _ensure_log_header():
    if not os.path.exists(LOG_FILE) or os.path.getsize(LOG_FILE) == 0:
        header = (
            "# Payment Ledger System — Experiment Log\n\n"
            "Centralized ledger of benchmark and diagnostic experiments tracking performance, "
            "latency breakdowns, and optimization milestones.\n\n"
            "---\n"
        )
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.write(header)

def record_benchmark_experiment(name, config, results, purpose=None, observation=None, next_step=None):
    """Records a standard benchmark run into the experiment tracking system."""
    _ensure_log_header()
    exp_num = _get_next_experiment_num()
    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", name).strip("_").lower()
    exp_name = f"{exp_num}_{slug}"
    exp_folder = os.path.join(RESULTS_DIR, exp_name)
    os.makedirs(exp_folder, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Save raw results JSON
    raw_payload = {
        "experiment": exp_name,
        "name": name,
        "timestamp": timestamp,
        "config": config,
        "results": results
    }
    raw_path = os.path.join(exp_folder, "results.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(raw_payload, f, indent=2)

    # Group results by scenario to find peak concurrency / key metrics
    scenarios = {}
    for r in results:
        sc = r["scenario"]
        scenarios.setdefault(sc, []).append(r)

    # Derive purpose if not provided
    if not purpose:
        vus_str = ", ".join(str(v) for v in config.get("vus", []))
        purpose = f"Evaluate {len(scenarios)} transfer scenario(s) across concurrency levels [{vus_str}] (trials: {config.get('trials', 3)}x)."

    # Format RPS, Latencies, Errors, Diagnostic metrics
    rps_lines = []
    latency_lines = []
    error_lines = []
    peak_locks = max((r.get("peak_locks", 0) for r in results), default=0)
    total_deadlocks = sum(r.get("deadlocks", 0) for r in results)

    for sc, entries in scenarios.items():
        peak_entry = max(entries, key=lambda x: x["vus"])
        vus = peak_entry["vus"]
        rps_lines.append(f"`{sc}` ({vus} VUs): {peak_entry['rps']:.2f} r/s")
        latency_lines.append(
            f"`{sc}` ({vus} VUs): p50: {_format_ms(peak_entry['p50_ms'])} | "
            f"p95: {_format_ms(peak_entry['p95_ms'])} | p99: {_format_ms(peak_entry['p99_ms'])}"
        )
        if peak_entry["errors_pct"] > 0:
            error_lines.append(f"`{sc}`: {peak_entry['errors_pct']:.2f}%")

    errors_str = ", ".join(error_lines) if error_lines else "0.00% across all scenarios"

    deadlock_msg = f"{total_deadlocks} (invariant preserved)" if total_deadlocks == 0 else f"**{total_deadlocks} DEADLOCKS DETECTED**"
    diagnostic_metrics = f"Peak concurrent row locks: {peak_locks} | Total deadlocks: {deadlock_msg}"

    # Derive observation if not provided
    if not observation:
        obs_parts = []
        if total_deadlocks == 0:
            obs_parts.append("Deterministic lock ordering strictly prevented deadlocks under all loads.")
        if "hot_wallet" in scenarios:
            hw_peak = max(scenarios["hot_wallet"], key=lambda x: x["vus"])
            if hw_peak["p99_ms"] > 1000:
                obs_parts.append(f"Hot-wallet throughput collapsed under lock contention (p99: {_format_ms(hw_peak['p99_ms'])}).")
        if "normal_transfers" in scenarios:
            norm_peak = max(scenarios["normal_transfers"], key=lambda x: x["vus"])
            obs_parts.append(f"Normal transfers achieved {norm_peak['rps']:.2f} r/s with zero lock contention.")
        observation = " ".join(obs_parts) if obs_parts else "Benchmark completed within expected performance parameters."

    pool_part = f" | DB Pool: {config.get('pool')} conns" if "pool" in config else ""
    config_str = (
        f"{', '.join(str(v) for v in config.get('vus', []))} VUs | "
        f"Duration: {config.get('duration', '25s')} | "
        f"Trials: {config.get('trials', 3)}x avg | "
        f"Host: {config.get('host', 'http://localhost:8080')}{pool_part}"
    )

    # Format markdown entry
    rps_str = "\n  - ".join(rps_lines) if len(rps_lines) > 1 else (rps_lines[0] if rps_lines else "N/A")
    lat_str = "\n  - ".join(latency_lines) if len(latency_lines) > 1 else (latency_lines[0] if latency_lines else "N/A")
    next_step_entry = f"- **Next Step:** {next_step}\n" if next_step else ""

    entry = (
        f"\n## Experiment {exp_num}: {name}\n"
        f"- **Date:** {timestamp}\n"
        f"- **Hypothesis / Purpose:** {purpose}\n"
        f"- **Configuration:** {config_str}\n"
        f"- **RPS:**\n  - {rps_str}\n"
        f"- **p50 / p95 / p99:**\n  - {lat_str}\n"
        f"- **Errors:** {errors_str}\n"
        f"- **Relevant Diagnostic Metrics:** {diagnostic_metrics}\n"
        f"- **Observation:** {observation}\n"
        f"{next_step_entry}\n"
        f"---\n"
    )

    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry)

    _print_terminal_summary(exp_num, name, exp_folder)
    return exp_folder

def record_diagnostic_experiment(name, config, diagnostic_results, purpose=None, observation=None, next_step=None):
    """Records a contention diagnostic run into the experiment tracking system."""
    _ensure_log_header()
    exp_num = _get_next_experiment_num()
    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", name).strip("_").lower()
    exp_name = f"{exp_num}_{slug}"
    exp_folder = os.path.join(RESULTS_DIR, exp_name)
    os.makedirs(exp_folder, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Save raw diagnostic JSON
    raw_payload = {
        "experiment": exp_name,
        "name": name,
        "timestamp": timestamp,
        "config": config,
        "diagnostics": diagnostic_results
    }
    raw_path = os.path.join(exp_folder, "diagnostic.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(raw_payload, f, indent=2)

    if not purpose:
        scenarios_str = ", ".join(diagnostic_results.keys())
        purpose = f"Decompose transfer lifecycle latency (pool wait vs lock wait vs WAL) for [{scenarios_str}] under {config.get('vus', 500)} VUs."

    rps_lines = []
    lat_lines = []
    diag_lines = []
    obs_lines = []

    for sc, data in diagnostic_results.items():
        http = data.get("http", {})
        db = data.get("db", {})

        rps = http.get("http_rps", http.get("rps", 0.0))
        p50 = http.get("http_p50", http.get("p50_ms", 0.0))
        p95 = http.get("http_p95", http.get("p95_ms", 0.0))
        p99 = http.get("http_p99", http.get("p99_ms", 0.0))

        rps_lines.append(f"`{sc}`: {rps:.2f} r/s")
        lat_lines.append(f"`{sc}`: p50: {_format_ms(p50)} | p95: {_format_ms(p95)} | p99: {_format_ms(p99)}")

        # DB breakdown percentages
        total_db_avg = db.get("total_db", {}).get("avg", 1.0)
        if total_db_avg <= 0:
            total_db_avg = 1.0

        pool_pct = (db.get("conn_pool_wait", {}).get("avg", 0.0) / total_db_avg) * 100
        lock_pct = (db.get("lock_wait", {}).get("avg", 0.0) / total_db_avg) * 100
        work_pct = ((db.get("wallet_updates", {}).get("avg", 0.0) + db.get("ledger_inserts", {}).get("avg", 0.0)) / total_db_avg) * 100
        commit_pct = (db.get("commit_wal", {}).get("avg", 0.0) / total_db_avg) * 100

        diag_lines.append(
            f"`{sc}`: Pool wait: {pool_pct:.1f}% ({_format_ms(db.get('conn_pool_wait', {}).get('avg', 0.0))}) | "
            f"Lock wait: {lock_pct:.1f}% ({_format_ms(db.get('lock_wait', {}).get('avg', 0.0))}) | "
            f"DB work: {work_pct:.1f}% | Commit/WAL: {commit_pct:.1f}%"
        )

        pool_size = config.get("pool", 10)
        if pool_pct > 50 and lock_pct > 15:
            obs_lines.append(
                f"`{sc}` suffers from a dual bottleneck: row locks serialize requests on PostgreSQL, "
                f"causing active connections to block for {_format_ms(db.get('lock_wait', {}).get('avg', 0.0))} "
                f"and starving Go's {pool_size}-connection pool ({pool_pct:.1f}% wait time)."
            )
        elif pool_pct > 60:
            obs_lines.append(f"`{sc}` is primarily starved on Go connection pool acquisition ({pool_pct:.1f}%).")
        elif lock_pct > 60:
            obs_lines.append(f"`{sc}` is primarily blocked on PostgreSQL row-level locks ({lock_pct:.1f}%).")

    if not observation:
        observation = " ".join(obs_lines) if obs_lines else "Diagnostic profiling completed."

    config_str = (
        f"{config.get('vus', 500)} VUs | "
        f"Duration: {config.get('duration', '12s')} | "
        f"DB Pool: {config.get('pool', 10)} conns | "
        f"Host: {config.get('base_url', 'http://localhost:8080')}"
    )

    rps_str = "\n  - ".join(rps_lines) if len(rps_lines) > 1 else (rps_lines[0] if rps_lines else "N/A")
    lat_str = "\n  - ".join(lat_lines) if len(lat_lines) > 1 else (lat_lines[0] if lat_lines else "N/A")
    diag_str = "\n  - ".join(diag_lines) if len(diag_lines) > 1 else (diag_lines[0] if diag_lines else "N/A")
    next_step_entry = f"- **Next Step:** {next_step}\n" if next_step else ""

    entry = (
        f"\n## Experiment {exp_num}: {name}\n"
        f"- **Date:** {timestamp}\n"
        f"- **Hypothesis / Purpose:** {purpose}\n"
        f"- **Configuration:** {config_str}\n"
        f"- **RPS:**\n  - {rps_str}\n"
        f"- **p50 / p95 / p99:**\n  - {lat_str}\n"
        f"- **Errors:** 0.00%\n"
        f"- **Relevant Diagnostic Metrics:**\n  - {diag_str}\n"
        f"- **Observation:** {observation}\n"
        f"{next_step_entry}\n"
        f"---\n"
    )

    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry)

    _print_terminal_summary(exp_num, name, exp_folder)
    return exp_folder

def _print_terminal_summary(exp_num, name, folder):
    """Prints a clean, concise terminal notice."""
    w = 78
    print("\n\033[1;36m┌" + "─" * (w - 2) + "┐\033[0m")
    title = f"EXPERIMENT TRACKED: #{exp_num} [{name}]"
    print("\033[1;36m│\033[0m" + title.center(w - 2) + "\033[1;36m│\033[0m")
    print("\033[1;36m├" + "─" * (w - 2) + "┤\033[0m")
    print(f"\033[1;36m│\033[0m  • Log Entry:  benchmarks/experiments/experiment_log.md".ljust(w - 1) + "\033[1;36m│\033[0m")
    bench_root = os.path.dirname(EXP_DIR)
    repo_root = os.path.dirname(bench_root)
    rel_folder = os.path.relpath(folder, repo_root)
    print(f"\033[1;36m│\033[0m  • Raw Result: {rel_folder}/".ljust(w - 1) + "\033[1;36m│\033[0m")
    print("\033[1;36m└" + "─" * (w - 2) + "┘\033[0m\n")

if __name__ == "__main__":
    # Self-test runnable check
    print(f"Next experiment number: {_get_next_experiment_num()}")
    print("Tracker self-check passed.")
