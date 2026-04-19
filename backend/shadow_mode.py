"""Plan 4 T8: shadow-mode dual-run diff logger.

When SKILL_LIBRARY_ENABLED + SKILL_SHADOW_MODE_ENABLED are both on,
the agent records the divergence between the legacy-string path and
the block-path (content length, sha, retrieved skill names) without
affecting the user-facing answer.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

logger = logging.getLogger(__name__)


class ShadowRunner:
    def __init__(self, audit_path: Path):
        self.audit_path = audit_path

    def log(
        self,
        *,
        session_id: str,
        question_hash: str,
        legacy_text: str,
        block_texts: Iterable[str],
        retrieved_skills: Optional[list] = None,
    ) -> None:
        try:
            self.audit_path.parent.mkdir(parents=True, exist_ok=True)
            blocks_combined = "\n".join(block_texts)
            rec = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "session_id": session_id,
                "question_hash": question_hash,
                "legacy_len": len(legacy_text),
                "blocks_len": len(blocks_combined),
                "legacy_sha": hashlib.sha256(legacy_text.encode()).hexdigest()[:16],
                "blocks_sha": hashlib.sha256(blocks_combined.encode()).hexdigest()[:16],
                "retrieved_skills": retrieved_skills or [],
            }
            with self.audit_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
        except Exception as exc:  # noqa: BLE001
            logger.warning("shadow_mode: log failed: %s", exc)
