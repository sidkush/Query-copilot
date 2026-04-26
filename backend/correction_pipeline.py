"""Single-entry correction pipeline (Phase F).

Orchestrates three safety rails before a correction becomes a
tenant-scoped few-shot example:

  1. AdversarialSimilarity storm check  (per-user thumbs-up rate)
  2. H15 admin ceremony approval check  (2-admin ACK)
  3. Golden-eval gate                   (7-suite shadow regression)

On pass -> QueryMemory.promote_example() + ledger append.
On any fail -> reason recorded in ledger, no ChromaDB write.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class RejectReason(Enum):
    FEATURE_DISABLED = "feature_disabled"
    ADVERSARIAL_STORM = "adversarial_storm"
    CEREMONY_NOT_APPROVED = "ceremony_not_approved"
    GOLDEN_EVAL_REGRESSION = "golden_eval_regression"
    QUOTA_EXCEEDED = "quota_exceeded"
    INTERNAL_ERROR = "internal_error"


@dataclass(frozen=True)
class PromotionResult:
    promoted: bool
    reason: Optional[RejectReason] = None
    doc_id: Optional[str] = None
    details: Optional[dict] = None


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def _append_ledger(ledger_root: Path, tenant_id: str, row: dict) -> None:
    ledger_root = Path(ledger_root)
    ledger_root.mkdir(parents=True, exist_ok=True)
    path = ledger_root / f"{tenant_id}.jsonl"
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")


def promote_to_examples(
    *,
    candidate: dict,
    memory,
    similarity,
    gate,
    ledger_root,
) -> PromotionResult:
    """Entry-point. `candidate` keys:
        candidate_id, question, canonical_sql, tenant_id, conn_id, user_id,
        user_hash, embedding, ceremony_state, ts.
    """
    try:
        from config import settings
        enabled = bool(getattr(settings, "FEATURE_CORRECTION_PIPELINE", True))
        require_cer = bool(getattr(settings, "PROMOTION_ADMIN_CEREMONY_REQUIRED", True))
    except Exception:
        enabled = True
        require_cer = True

    base_row = {
        "candidate_id": candidate["candidate_id"],
        "tenant_id": candidate["tenant_id"],
        "conn_id": candidate["conn_id"],
        "user_id": candidate["user_id"],
        "question": candidate["question"],
        "ts": _iso_now(),
    }

    if not enabled:
        result = PromotionResult(False, RejectReason.FEATURE_DISABLED)
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": result.reason.value})
        return result

    # 1) Storm detection.
    try:
        ts_dt = datetime.now(timezone.utc)
        if similarity.is_storm(
            user_hash=candidate["user_hash"],
            embedding=candidate["embedding"],
            ts=ts_dt,
        ):
            result = PromotionResult(False, RejectReason.ADVERSARIAL_STORM)
            _append_ledger(ledger_root, candidate["tenant_id"],
                           {**base_row, "promoted": False, "reason": result.reason.value})
            return result
        similarity.record(
            user_hash=candidate["user_hash"],
            embedding=candidate["embedding"],
            ts=ts_dt,
        )
    except Exception as e:
        logger.warning("correction_pipeline: similarity check failed (%s) — blocking conservatively", e)
        result = PromotionResult(False, RejectReason.ADVERSARIAL_STORM,
                                 details={"error": str(e)})
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": result.reason.value})
        return result

    # 2) Ceremony.
    if require_cer and candidate.get("ceremony_state") != "approved":
        result = PromotionResult(False, RejectReason.CEREMONY_NOT_APPROVED)
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": result.reason.value})
        return result

    # 3) Golden-eval.
    decision = gate.check()
    if decision.block:
        result = PromotionResult(False, RejectReason.GOLDEN_EVAL_REGRESSION,
                                 details={"worst_suite": decision.worst_suite,
                                          "worst_delta_pct": decision.worst_delta_pct})
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": result.reason.value,
                        "deltas_pct": decision.deltas_pct})
        return result

    # 4) Write.
    try:
        doc_id = memory.promote_example(
            tenant_id=candidate["tenant_id"],
            conn_id=candidate["conn_id"],
            user_id=candidate["user_id"],
            question=candidate["question"],
            canonical_sql=candidate["canonical_sql"],
        )
    except Exception as e:
        reason = RejectReason.QUOTA_EXCEEDED if "Quota" in e.__class__.__name__ else RejectReason.INTERNAL_ERROR
        result = PromotionResult(False, reason, details={"error": str(e)})
        _append_ledger(ledger_root, candidate["tenant_id"],
                       {**base_row, "promoted": False, "reason": reason.value})
        return result

    result = PromotionResult(True, doc_id=doc_id)
    _append_ledger(ledger_root, candidate["tenant_id"],
                   {**base_row, "promoted": True, "doc_id": doc_id})
    return result


def adversarial_similarity_storm_count_last_hour(tenant_id: str) -> int:
    """Return count of adversarial upvote storms for tenant in last hour. 0 if no data."""
    return 0  # stub — real impl reads promotion_ledger
