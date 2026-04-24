"""H8 — Chaos isolation primitives.

- jittered_backoff(attempt, base_ms, max_ms)
- Singleflight — only one caller per key runs the function; others wait.
- CostBreaker — per-tenant USD/minute cap.
- SSECursor — resumable stream position after disconnect.
"""
from __future__ import annotations

import json
import os
import random
import tempfile
import threading
import time
from collections import defaultdict, deque
from pathlib import Path


def jittered_backoff(attempt: int, base_ms: int = 50, max_ms: int = 500) -> int:
    cap = min(max_ms, base_ms * (2 ** max(0, attempt)))
    return random.randint(0, cap)


class Singleflight:
    def __init__(self):
        self._lock = threading.Lock()
        self._active: dict = {}

    def do(self, key: str, fn):
        with self._lock:
            evt = self._active.get(key)
            if evt is None:
                evt = threading.Event()
                self._active[key] = evt
                owner = True
            else:
                owner = False

        if owner:
            try:
                result = fn()
                evt._result = result
                evt._error = None
            except BaseException as exc:
                evt._result = None
                evt._error = exc
            finally:
                evt.set()
                with self._lock:
                    self._active.pop(key, None)
        else:
            evt.wait()

        err = getattr(evt, "_error", None)
        if err is not None:
            raise err
        return getattr(evt, "_result", None)


class CostExceeded(RuntimeError):
    pass


class CostBreaker:
    def __init__(self, max_usd_per_minute: float = 1.0):
        self.max_usd_per_minute = max_usd_per_minute
        self._spend: dict = defaultdict(deque)
        self._lock = threading.Lock()

    def charge(self, tenant_id: str, usd: float) -> None:
        with self._lock:
            self._spend[tenant_id].append((time.time(), usd))

    def _sum_recent(self, tenant_id: str) -> float:
        cutoff = time.time() - 60.0
        dq = self._spend[tenant_id]
        while dq and dq[0][0] < cutoff:
            dq.popleft()
        return sum(u for _, u in dq)

    def check(self, tenant_id: str) -> None:
        with self._lock:
            total = self._sum_recent(tenant_id)
        if total > self.max_usd_per_minute:
            raise CostExceeded(
                f"Tenant {tenant_id!r} spent ${total:.2f} in last 60s "
                f"(cap ${self.max_usd_per_minute:.2f})"
            )


class SSECursor:
    def __init__(self, root, ttl_seconds: int = 300):
        self.root = Path(root)
        self.ttl_seconds = ttl_seconds

    def _path(self, session_id: str) -> Path:
        return self.root / f"{session_id}.cursor.json"

    def record(self, session_id: str, position: int) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        target = self._path(session_id)
        payload = {"position": int(position), "recorded_at": time.time()}
        fd, tmp = tempfile.mkstemp(dir=str(self.root), prefix=f".{session_id}_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            os.replace(tmp, target)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def get(self, session_id: str):
        path = self._path(session_id)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
        if time.time() - payload.get("recorded_at", 0) > self.ttl_seconds:
            return None
        return int(payload.get("position", 0))


def cross_region_hash_divergence_last_hour(tenant_id: str) -> int:
    """Return count of cross-region result-hash divergences in last hour. 0 if no data."""
    return 0  # stub — real implementation reads sampler counter
