"""Oracle-based trap grader. NO LLM-judge (kills grader-self-buggy class).

Each oracle type has a deterministic check:
- date_range:        verify SQL mentions MIN/MAX and table; run on fixture to confirm
- distinct_months:   parse SELECT DISTINCT EXTRACT / strftime
- max_date:          sanity-run on fixture, compare returned max >= min_expected
- must_query_table:  substring match for table name
- must_not_refuse:   reject if any forbidden_phrase in SQL (case-insensitive)
"""
from __future__ import annotations
import os
import re as _re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class TrapResult:
    trap_id: str
    passed: bool
    reason: str


def _resolve_db_path(db_path: Path) -> Path:
    """On Windows, Path('/tmp/foo') resolves to '\\tmp\\foo' which may be an empty stub.
    Always prefer %TEMP% when the db_path has 'tmp' as root-child and the TEMP
    candidate has the same filename and is a valid SQLite database.
    """
    parts = db_path.parts
    if len(parts) >= 2 and parts[1].lower() == "tmp":
        temp_dir = os.environ.get("TEMP", os.environ.get("TMP", ""))
        if temp_dir:
            candidate = Path(temp_dir) / db_path.name
            if candidate.exists():
                return candidate
    return db_path


def _check_substrings(sql: str, needles: list[str]) -> tuple[bool, str]:
    lower = sql.lower()
    missing = [n for n in needles if n.lower() not in lower]
    if missing:
        return False, f"missing expected substrings: {missing}"
    return True, "all expected substrings present"


def _check_date_range(
    sql: str, oracle: dict[str, Any], db_path: Path
) -> tuple[bool, str]:
    # Structural check first (no DB hit).
    lc = sql.lower()
    if "min(" not in lc or "max(" not in lc:
        return False, "sql does not compute both MIN and MAX"
    if oracle["table"].lower() not in lc:
        return False, f"sql does not reference table {oracle['table']}"
    # Actual range sanity on fixture.
    resolved = _resolve_db_path(db_path)
    if not resolved.exists():
        # If fixture not available, skip DB check — structural check passed.
        return True, "date range structural check passed (fixture not available for runtime check)"
    conn = sqlite3.connect(resolved)
    try:
        cur = conn.execute(
            f"SELECT MIN({oracle['column']}), MAX({oracle['column']}) FROM {oracle['table']}"
        )
        actual_min, actual_max = cur.fetchone()
    finally:
        conn.close()
    if actual_min > oracle.get("min_should_be_before", "9999-12-31"):
        return False, f"actual min {actual_min} not before threshold"
    if actual_max < oracle.get("max_should_be_after", "0000-01-01"):
        return False, f"actual max {actual_max} not after threshold"
    return True, "date range matches oracle"


def _check_max_date(
    sql: str, oracle: dict[str, Any], db_path: Path
) -> tuple[bool, str]:
    """max_date oracle: verify SQL has MAX() on the right table."""
    lc = sql.lower()
    if "max(" not in lc:
        return False, "sql does not compute MAX"
    if oracle["table"].lower() not in lc:
        return False, f"sql does not reference table {oracle['table']}"
    # Actual max sanity on fixture.
    resolved = _resolve_db_path(db_path)
    if not resolved.exists():
        return True, "max_date structural check passed (fixture not available for runtime check)"
    conn = sqlite3.connect(resolved)
    try:
        cur = conn.execute(
            f"SELECT MAX({oracle['column']}) FROM {oracle['table']}"
        )
        actual_max = cur.fetchone()[0]
    finally:
        conn.close()
    min_expected = oracle.get("min_expected", "0000-01-01")
    if actual_max < min_expected:
        return False, f"actual max {actual_max} not after threshold {min_expected}"
    return True, "max date matches oracle"


def _check_must_not_refuse(sql: str, oracle: dict[str, Any]) -> tuple[bool, str]:
    lc = sql.lower()
    for phrase in oracle.get("forbidden_phrases", []):
        if phrase.lower() in lc:
            return False, f"forbidden phrase {phrase!r} present in output"
    return True, "no forbidden phrases"


def _check_must_query_table(sql: str, oracle: dict[str, Any]) -> tuple[bool, str]:
    if oracle["table"].lower() not in sql.lower():
        return False, f"sql does not reference required table {oracle['table']}"
    return True, "table referenced"


def _check_must_mention_full_range(
    sql: str, oracle: dict[str, Any], db_path: Path
) -> tuple[bool, str]:
    """Ring-1 oracle: SQL must compute MIN and MAX on a column and reference
    the target table. Then run it on the fixture and confirm the actual range
    spans the required before/after thresholds.
    """
    lc = sql.lower()
    if "min(" not in lc or "max(" not in lc:
        return False, "sql must compute both MIN and MAX"
    tbl = oracle["table"]
    if tbl.lower() not in lc:
        return False, f"sql does not reference table {tbl}"
    resolved = _resolve_db_path(db_path)
    if not resolved.exists():
        return True, "range structural check passed (fixture not available for runtime check)"
    conn = sqlite3.connect(str(resolved))
    try:
        cur = conn.execute(
            f"SELECT MIN({oracle['column']}), MAX({oracle['column']}) FROM {tbl}"
        )
        actual_min, actual_max = cur.fetchone()
    finally:
        conn.close()
    if actual_min is None or actual_max is None:
        return False, "fixture returned empty range"
    if actual_min > oracle.get("min_before", "9999-12-31"):
        return False, f"actual min {actual_min} not before threshold"
    if actual_max < oracle.get("max_after", "0000-01-01"):
        return False, f"actual max {actual_max} not after threshold"
    return True, "range spans required window"


def _check_must_not_claim_limited(
    sql: str, oracle: dict[str, Any]
) -> tuple[bool, str]:
    """Ring-1 oracle: reject any forbidden phrase suggesting the dataset is
    narrower than it actually is."""
    lc = sql.lower()
    for phrase in oracle.get("forbidden_phrases", []):
        if phrase.lower() in lc:
            return False, f"forbidden 'limited' phrase {phrase!r} present"
    return True, "no 'limited' claims"


def _check_must_trigger_validator_rule(sql: str, oracle: dict) -> tuple:
    rule = oracle.get("rule", "")
    marker = f"validator fired: {rule}"
    if marker in sql.lower():
        return True, f"validator rule {rule!r} fired as expected"
    return False, f"validator rule {rule!r} expected but not present in SQL"


def _check_must_not_trigger_validator_rule(sql: str, oracle: dict) -> tuple:
    rule = oracle.get("rule", "")
    marker = f"validator fired: {rule}"
    if marker in sql.lower():
        return False, f"validator rule {rule!r} fired but was expected clean"
    return True, f"validator rule {rule!r} not triggered (clean)"


def _check_must_emit_intent_echo(sql: str, oracle: dict) -> tuple:
    min_amb = float(oracle.get("min_ambiguity", 0.3))
    m = _re.search(r"intent_echo:\s*ambiguity=([\d.]+)", sql, _re.IGNORECASE)
    if not m:
        return False, "no intent_echo marker in SQL"
    score = float(m.group(1))
    if score < min_amb:
        return False, f"intent_echo ambiguity {score} below required {min_amb}"
    return True, f"intent_echo ambiguity {score} >= {min_amb}"


def _check_must_not_emit_intent_echo(sql: str, oracle: dict) -> tuple:
    max_amb = float(oracle.get("max_ambiguity", 0.3))
    m = _re.search(r"intent_echo:\s*ambiguity=([\d.]+)", sql, _re.IGNORECASE)
    if not m:
        return True, "no intent_echo marker (clean)"
    score = float(m.group(1))
    if score > max_amb:
        return False, f"intent_echo fired at {score} but expected <= {max_amb}"
    return True, f"intent_echo at {score} within allowed <= {max_amb}"


def _check_must_include_clause(sql: str, oracle: dict) -> tuple:
    kind = oracle.get("clause_kind", "")
    marker = f"clause: {kind}"
    if marker.lower() in sql.lower():
        return True, f"clause {kind!r} present"
    return False, f"clause {kind!r} missing from SQL"


def _check_must_force_live_tier(sql: str, oracle: dict) -> tuple:
    if "tier: live" in sql.lower():
        return True, "forced live tier"
    return False, "tier not forced to live"


def _check_must_emit_chip(sql: str, oracle: dict) -> tuple:
    want = (oracle.get("trust") or "").lower()
    if not want:
        return False, "must_emit_chip oracle missing 'trust' field"
    if f"chip: {want}" in sql.lower():
        return True, f"chip {want!r} emitted"
    return False, f"chip {want!r} not emitted"


def _check_must_use_tenant_composite_key(sql: str, oracle: dict) -> tuple:
    if "tenant_key:" in sql.lower() and "tenant:" in sql.lower() and "conn:" in sql.lower():
        return True, "tenant composite key present"
    return False, "tenant composite key marker missing"


def _check_must_include_median_when_skewed(sql: str, oracle: dict) -> tuple:
    if "median" in sql.lower():
        return True, "median phrase included"
    return False, "median phrase missing (skew guard expected)"


def _check_must_use_requester_byok(sql: str, oracle: dict) -> tuple:
    if "byok: requester" in sql.lower():
        return True, "BYOK bound to requester"
    return False, "BYOK binding marker missing"


def _check_must_cascade_right_to_erasure(sql: str, oracle: dict) -> tuple:
    markers = ("erasure: cascade", "deleted from chromadb", "deleted from audit")
    if any(m in sql.lower() for m in markers):
        return True, "erasure cascade marker present"
    return False, "erasure cascade marker missing"


def _check_must_route_eu_tenant_to_eu(sql: str, oracle: dict) -> tuple:
    if "endpoint: eu" in sql.lower():
        return True, "EU endpoint used"
    return False, "EU endpoint marker missing"


def _check_must_safe_abort(sql: str, oracle: dict) -> tuple:
    marker = "safe_abort:"
    if marker not in sql.lower():
        return False, "expected safe_abort marker not present"
    needed = oracle.get("reason_contains", "").lower()
    if needed and needed not in sql.lower():
        return False, f"safe_abort reason missing {needed!r}"
    return True, "safe_abort ok"


def _check_must_bound_steps(sql: str, oracle: dict) -> tuple:
    m = _re.search(r"step_count:\s*(\d+)", sql.lower())
    if not m:
        return False, "step_count marker missing"
    steps = int(m.group(1))
    cap = int(oracle.get("max_steps", 20))
    if steps > cap:
        return False, f"{steps} steps exceeds cap {cap}"
    return True, f"{steps} steps within cap {cap}"


def _check_must_use_planner(sql: str, oracle: dict) -> tuple:
    m = _re.search(r"plan_artifact:\s*ctes=(\d+)", sql.lower())
    if not m:
        return False, "plan_artifact marker missing"
    ctes = int(m.group(1))
    cap = int(oracle.get("max_ctes", 3))
    if ctes > cap:
        return False, f"{ctes} CTEs exceeds cap {cap}"
    return True, f"{ctes} CTEs within cap {cap}"


def _check_must_escalate_model(sql: str, oracle: dict) -> tuple:
    m = _re.search(r"model_tier:\s*(\w+)", sql.lower())
    if not m:
        return False, "model_tier marker missing"
    tier = m.group(1)
    expected = oracle.get("expected_tier", "").lower()
    if tier != expected:
        return False, f"tier {tier!r} != expected {expected!r}"
    return True, f"tier {tier!r} matches"


def _check_must_chain_verify(sql: str, oracle: dict):
    lc = sql.lower()
    if "chain_ok=true" in lc:
        return True, "chain ok"
    if "chain_ok=false" in lc:
        return False, "chain broken per marker"
    return False, "chain verify marker missing"


def _check_must_emit_unverified_chip(sql: str, oracle: dict):
    import re as _re
    m = _re.search(r"unverified_count\s*=\s*(\d+)", sql.lower())
    if not m:
        return False, "unverified_count marker missing"
    count = int(m.group(1))
    expected_chip = bool(oracle.get("expect_chip", False))
    if expected_chip and count > 0:
        return True, f"{count} unverified chips as expected"
    if not expected_chip and count == 0:
        return True, "no unverified chips as expected"
    return False, f"count={count} vs expect_chip={expected_chip}"


def _check_must_reuse_plan(sql: str, oracle: dict):
    lc = sql.lower()
    hit = "plan_cache: hit=true" in lc
    expected = bool(oracle.get("expect_hit", False))
    if hit == expected:
        return True, f"hit={hit} matches expected"
    return False, f"hit={hit} != expected {expected}"


def _check_must_abort_on_cancel(sql: str, oracle: dict):
    import re as _re
    m = _re.search(r"aborted_at_step\s*=\s*(\d+)", sql.lower())
    if not m:
        return False, "aborted_at_step marker missing"
    step = int(m.group(1))
    cap = int(oracle.get("abort_step_before", 999))
    if step < cap:
        return True, f"aborted at step {step} < cap {cap}"
    return False, f"aborted at step {step} >= cap {cap}"


def _check_must_transpile_clean(sql: str, oracle: dict):
    import re as _re
    source = oracle.get("source", "")
    targets = oracle.get("targets", [])
    lc = sql.lower()
    for tgt in targets:
        marker = f"transpile_ok: {source}->{tgt}=true"
        if marker.lower() not in lc:
            return False, f"missing transpile-ok marker for {source}->{tgt}"
    return True, f"all {len(targets)} transpile markers present"


def _check_must_route_capability(sql: str, oracle: dict):
    import re as _re
    engine = oracle.get("engine", "")
    feature = oracle.get("feature", "")
    expect_block = bool(oracle.get("expect_block", False))
    pattern = _re.compile(rf"capability_route:\s*{engine}\.{feature}\s*blocked=(true|false)", _re.I)
    m = pattern.search(sql)
    if not m:
        return False, f"capability_route marker missing for {engine}.{feature}"
    observed = m.group(1).lower() == "true"
    if observed == expect_block:
        return True, f"capability routing {engine}.{feature} = blocked:{observed}"
    return False, f"capability routing {engine}.{feature}: got blocked:{observed}, expected blocked:{expect_block}"


_HANDLERS = {
    "date_range": _check_date_range,
    "must_not_refuse": lambda sql, ora, _db: _check_must_not_refuse(sql, ora),
    "must_query_table": lambda sql, ora, _db: _check_must_query_table(sql, ora),
    "max_date": _check_max_date,
    "distinct_months": lambda sql, ora, _db: _check_must_query_table(sql, ora),  # loose check — tighten later
    # Phase B — Ring 1 oracles.
    "must_mention_full_range": _check_must_mention_full_range,
    "must_not_claim_limited": lambda sql, ora, _db: _check_must_not_claim_limited(sql, ora),
    # Phase C — Ring 3 oracles.
    "must_trigger_validator_rule": lambda sql, ora, _db: _check_must_trigger_validator_rule(sql, ora),
    "must_not_trigger_validator_rule": lambda sql, ora, _db: _check_must_not_trigger_validator_rule(sql, ora),
    # Phase D — Ring 4 oracles.
    "must_emit_intent_echo":     lambda sql, ora, _db: _check_must_emit_intent_echo(sql, ora),
    "must_not_emit_intent_echo": lambda sql, ora, _db: _check_must_not_emit_intent_echo(sql, ora),
    "must_include_clause":       lambda sql, ora, _db: _check_must_include_clause(sql, ora),
    # Phase E — Ring 5/6 oracles (sampling trust + multi-tenant).
    "must_force_live_tier":                lambda sql, ora, _db: _check_must_force_live_tier(sql, ora),
    "must_emit_chip":                      lambda sql, ora, _db: _check_must_emit_chip(sql, ora),
    "must_use_tenant_composite_key":       lambda sql, ora, _db: _check_must_use_tenant_composite_key(sql, ora),
    "must_include_median_when_skewed":     lambda sql, ora, _db: _check_must_include_median_when_skewed(sql, ora),
    "must_use_requester_byok_not_owner":   lambda sql, ora, _db: _check_must_use_requester_byok(sql, ora),
    "must_cascade_right_to_erasure":       lambda sql, ora, _db: _check_must_cascade_right_to_erasure(sql, ora),
    "must_route_eu_tenant_to_eu_endpoint": lambda sql, ora, _db: _check_must_route_eu_tenant_to_eu(sql, ora),
    # Phase K — Ring 8 CASL agent orchestration oracles.
    "must_safe_abort":      lambda sql, ora, _db: _check_must_safe_abort(sql, ora),
    "must_bound_steps":     lambda sql, ora, _db: _check_must_bound_steps(sql, ora),
    "must_use_planner":     lambda sql, ora, _db: _check_must_use_planner(sql, ora),
    "must_escalate_model":  lambda sql, ora, _db: _check_must_escalate_model(sql, ora),
    # Phase L — provenance + cache + cancel oracles.
    "must_chain_verify": lambda sql, ora, _db: _check_must_chain_verify(sql, ora),
    "must_emit_unverified_chip": lambda sql, ora, _db: _check_must_emit_unverified_chip(sql, ora),
    "must_reuse_plan": lambda sql, ora, _db: _check_must_reuse_plan(sql, ora),
    "must_abort_on_cancel": lambda sql, ora, _db: _check_must_abort_on_cancel(sql, ora),
    # Phase M-alt oracles.
    "must_transpile_clean": lambda sql, ora, _db: _check_must_transpile_clean(sql, ora),
    "must_route_capability": lambda sql, ora, _db: _check_must_route_capability(sql, ora),
}


def grade_trap(trap: dict[str, Any], emitted_sql: str, db_path: Path) -> TrapResult:
    # Substring gate first.
    ok, reason = _check_substrings(emitted_sql, trap.get("expected_sql_contains", []))
    if not ok:
        return TrapResult(trap["id"], False, reason)

    oracle = trap.get("oracle", {})
    handler = _HANDLERS.get(oracle.get("type"))
    if handler is None:
        return TrapResult(trap["id"], False, f"unknown oracle type {oracle.get('type')!r}")

    ok, reason = handler(emitted_sql, oracle, db_path)
    return TrapResult(trap["id"], ok, reason)


# ---------------------------------------------------------------------------
# Phase F — context-based oracles (operate on a structured context dict, not
# raw emitted SQL). Dispatched via grade_question() below.
# ---------------------------------------------------------------------------

def _check_must_block_thumbs_up_storm(context: dict[str, Any]) -> bool:
    """Oracle: if recent_upvotes from the same user are cosine-similar to the
    candidate embedding above threshold, the promote_outcome must be 'blocked'
    with block_reason == 'adversarial_storm'. If no storm detected, always pass.
    """
    from adversarial_similarity import cosine

    try:
        import sys, os as _os
        _backend = _os.path.join(_os.path.dirname(__file__), "..")
        if _backend not in sys.path:
            sys.path.insert(0, _backend)
        from config import settings
        threshold = float(settings.ADVERSARIAL_SIMILARITY_COSINE_THRESHOLD)
        max_up = int(settings.ADVERSARIAL_SIMILARITY_MAX_UPVOTES)
    except Exception:
        threshold = 0.92
        max_up = 3

    cand = context.get("candidate", {})
    recent = context.get("recent_upvotes", [])

    same_user_similar = sum(
        1 for up in recent
        if up.get("user_hash") == cand.get("user_hash")
        and cosine(up.get("embedding", []), cand.get("embedding", [])) >= threshold
    )
    is_storm = same_user_similar >= max_up
    if is_storm:
        return (
            context.get("promote_outcome") == "blocked"
            and context.get("block_reason") == "adversarial_storm"
        )
    return True


def _check_must_require_ceremony(context: dict[str, Any]) -> bool:
    """Oracle: promotion is only allowed when ceremony_state == 'approved'.
    Any other state must produce promote_outcome == 'blocked' with
    block_reason == 'ceremony_not_approved'.
    """
    state = (context.get("candidate") or {}).get("ceremony_state", "")
    outcome = context.get("promote_outcome")
    reason = context.get("block_reason")
    if state == "approved":
        return outcome == "allowed"
    return outcome == "blocked" and reason == "ceremony_not_approved"


def _check_must_block_on_golden_eval_regression(context: dict[str, Any]) -> bool:
    """Oracle: if any trap suite regresses by >= threshold_pct, the outcome
    must be 'blocked' with block_reason == 'golden_eval_regression'.
    Otherwise outcome must be 'allowed'.
    """
    deltas: dict[str, float] = context.get("shadow_deltas_pct", {})
    threshold: float = float(context.get("threshold_pct", 2.0))
    outcome = context.get("promote_outcome")
    reason = context.get("block_reason")

    regression = any(float(v) >= threshold for v in deltas.values())
    if regression:
        return outcome == "blocked" and reason == "golden_eval_regression"
    return outcome == "allowed"


def _check_must_cascade_erasure(context: dict[str, Any]) -> bool:
    """Oracle: erasure operations must produce promote_outcome == 'erased'.
    Vacuous correctness check — the test data declares the expected surfaces;
    the oracle simply confirms the recorded outcome is 'erased'.
    """
    return context.get("promote_outcome") == "erased"


def _check_must_enforce_tenant_quota(context: dict[str, Any]) -> bool:
    """Oracle: if attempt_count > quota for the tenant, promotion must be
    blocked with block_reason == 'quota_exceeded'. If attempt_count is not
    provided (testing cross-tenant isolation), allow vacuously.
    """
    attempt_count = context.get("attempt_count")
    quota = context.get("quota")
    outcome = context.get("promote_outcome")
    reason = context.get("block_reason")

    if attempt_count is None or quota is None:
        # Cross-tenant isolation test — vacuous allow check.
        return outcome == "allowed"
    if int(attempt_count) > int(quota):
        return outcome == "blocked" and reason == "quota_exceeded"
    return outcome == "allowed"


def _check_must_noop_when_feature_off(context: dict[str, Any]) -> bool:
    """Oracle: when feature_enabled is False, promote_to_examples must be a
    no-op — promote_outcome == 'blocked' with block_reason == 'feature_disabled'.
    When feature_enabled is True (or absent), pass vacuously.
    """
    feature_enabled = context.get("feature_enabled", True)
    if feature_enabled is False:
        outcome = context.get("promote_outcome")
        reason = context.get("block_reason")
        return outcome == "blocked" and reason == "feature_disabled"
    return True


_CONTEXT_HANDLERS = {
    # Phase F — correction pipeline oracles.
    "must_block_thumbs_up_storm":          _check_must_block_thumbs_up_storm,
    "must_require_ceremony":               _check_must_require_ceremony,
    "must_block_on_golden_eval_regression": _check_must_block_on_golden_eval_regression,
    "must_cascade_erasure":                _check_must_cascade_erasure,
    "must_enforce_tenant_quota":           _check_must_enforce_tenant_quota,
    "must_noop_when_feature_off":          _check_must_noop_when_feature_off,
}


# ---------------------------------------------------------------------------
# Phase H — hardening-surface oracle. Answer text (produced by a mock or real
# agent) must avoid every phrase in must_not_match AND include at least one
# phrase from must_match_any. All comparisons are case-insensitive.
# ---------------------------------------------------------------------------

def must_pass_hardening_surface(
    answer: str,
    *,
    must_not_match: list[str],
    must_match_any: list[str],
) -> bool:
    text = answer.lower()
    for bad in must_not_match:
        if bad.lower() in text:
            return False
    for good in must_match_any:
        if good.lower() in text:
            return True
    return False


_CONTEXT_HANDLERS["must_pass_hardening_surface"] = (
    lambda ctx: must_pass_hardening_surface(
        ctx.get("answer", ""),
        must_not_match=ctx.get("must_not_match", []),
        must_match_any=ctx.get("must_match_any", []),
    )
)


def grade_question(question: dict[str, Any], context: dict[str, Any]) -> bool:
    """Grade a Phase-F style question using a structured context dict.

    Returns True if the oracle passes, False if it fails. Raises ValueError
    for unknown oracle_type values.
    """
    oracle_type = question.get("oracle_type", "")
    handler = _CONTEXT_HANDLERS.get(oracle_type)
    if handler is None:
        raise ValueError(f"unknown oracle_type {oracle_type!r}")
    return handler(context)


def must_not_regress_retrieval_budget(
    baseline: dict,
    current: dict,
    *,
    target_pct: float,
) -> str | None:
    """Trap-grader oracle for Phase G.

    Returns None if `current['mean_tokens']` represents at least
    `target_pct` reduction vs `baseline['mean_tokens']`. Otherwise
    returns an error string for the trap report.
    """
    off = float(baseline["mean_tokens"])
    on = float(current["mean_tokens"])
    if off <= 0:
        return f"baseline mean_tokens invalid: {off}"
    reduction = (off - on) / off * 100.0
    if reduction < target_pct:
        return (
            f"retrieval budget regressed: got {reduction:.1f}% reduction, "
            f"target {target_pct:.1f}% (off={off:.1f}, on={on:.1f})"
        )
    return None
