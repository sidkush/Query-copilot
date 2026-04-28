# Benchmark Harness Discipline

Five rules for every BIRD benchmark script (smoke, pilot, main runs). A
20-minute invisible hang on a 3-hour run masks runaway loops, retry storms,
and rate-limit cascades — bleeding budget without warning. These rules make
silence a reliable hang signal.

Apply to anything under `backend/scripts/run_bird_*.py`,
`benchmarks/bird/run_*.py`, and any other long-running benchmark harness.

---

## Rule 1 — Always invoke with `python -u`

`python -u` forces unbuffered stdout/stderr at the interpreter level. Pipes
and redirects do NOT trigger Python's line-buffered stdout heuristic; without
`-u`, output is fully block-buffered and only flushes on process exit.

```bash
# BAD — block-buffered when stdout is not a tty
python scripts/smoke_bench_wave2.py > log.txt 2>&1

# GOOD
python -u scripts/smoke_bench_wave2.py > log.txt 2>&1
```

Harnesses themselves should also set `sys.stdout.reconfigure(line_buffering=True)`
defensively and pass `flush=True` on every `print` — `-u` is a discipline rule
the operator must remember; `flush=True` is insurance against forgetting.

---

## Rule 2 — Direct file redirect, never pipe-to-tail at launch

`| tail` and `| tee` introduce a second process whose stdout buffering you
don't control. `tail -N` in particular reads everything and only emits the
last N lines AFTER the upstream pipe closes — a 3-hour run produces zero
visible output for 3 hours. This is the exact bug that triggered this doc.

```bash
# BAD — full-buffer pipeline, output appears only after exit
python scripts/smoke_bench_wave2.py 2>&1 | tail -120

# BAD — tee buffers when stdout isn't a tty
python scripts/smoke_bench_wave2.py 2>&1 | tee log.txt

# GOOD — direct file, kernel-buffered (flushes on every write)
python -u scripts/smoke_bench_wave2.py > log.txt 2>&1 &
```

If you want last-N-lines after the run, do it AFTER the file is closed:
`tail -120 log.txt`.

---

## Rule 3 — Separate tail-follow monitor for live visibility

Spawn `tail -F` in a second pane / Monitor task / terminal to watch the log
grow in real time. `tail -F` (capital F) re-opens on rotate and survives
truncation; `tail -f` does not.

```bash
# Terminal 1 — run
python -u scripts/smoke_bench_wave2.py > log.txt 2>&1

# Terminal 2 — watch (or use the Claude Code Monitor tool)
tail -F log.txt
```

In Claude Code: use `Bash` with `run_in_background: true` for the harness,
then `Monitor` on the log file with an `until` loop on the completion marker.

---

## Rule 4 — Heartbeat lines

The harness must emit a heartbeat (timestamp + counter + cumulative spend)
on a fixed cadence regardless of what the API is doing. If the heartbeat
stops, the harness is hung — period. Without this, "no output for 5 minutes"
could mean "Anthropic is slow" OR "we're in an infinite loop" and you can't
tell.

Minimum heartbeat fields: ISO timestamp, current question index,
elapsed seconds in current question, cumulative spend USD.

```python
# Background thread, fires every HEARTBEAT_SECONDS even mid-API-call.
def _heartbeat_loop(state, stop_event, interval=10.0):
    while not stop_event.wait(interval):
        elapsed = time.time() - state["q_start"]
        print(
            f"  [hb {datetime.utcnow().isoformat(timespec='seconds')}Z] "
            f"q={state['q_idx']} elapsed={elapsed:.1f}s "
            f"spend=${state['spend']:.4f}",
            flush=True,
        )
```

Cadence: 10s for smoke, 30s for pilot, 60s for main runs.

---

## Rule 5 — Hard wall-clock budget per run

Abort and report when any single question exceeds N× the expected latency.
Use a relative budget (e.g. 4× the 95th-percentile of the previous N
questions), not a hardcoded constant — main runs have wildly different
latency distributions than smoke. Fall back to an absolute ceiling for the
first N questions before percentile data exists.

```python
# After per-question completion, update rolling latency buffer.
# Budget = max(ABSOLUTE_FLOOR, 4 * p95(last 20 questions))
WALL_CLOCK_FLOOR_S = 120.0  # smoke / first questions

def question_budget(latencies: list[float]) -> float:
    if len(latencies) < 5:
        return WALL_CLOCK_FLOOR_S
    p95 = sorted(latencies)[int(len(latencies) * 0.95)]
    return max(WALL_CLOCK_FLOOR_S, 4.0 * p95)
```

On exceed: log `[BUDGET_ABORT] q={i} elapsed={t}s budget={b}s`, kill the
in-flight agent, record question as failed-with-reason `wall_clock_exceeded`,
move on. Never silently break the loop.

---

## Combined launch template

For every BIRD harness from Phase 1 onward:

```bash
# Terminal 1
python -u backend/scripts/run_bird_phase2_pilot.py \
    --out benchmarks/bird/runs/$(date +%Y%m%d-%H%M)/ \
    > benchmarks/bird/runs/$(date +%Y%m%d-%H%M)/run.log 2>&1 &
echo $! > harness.pid

# Terminal 2
tail -F benchmarks/bird/runs/*/run.log

# Stop cleanly
kill -TERM $(cat harness.pid)
```

Harness must trap SIGTERM, flush partial results to disk, and exit
non-zero. No `kill -9`; that strands ChromaDB locks and partial JSONL.
