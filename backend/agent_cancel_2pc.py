"""Phase H — H26: Two-phase commit on agent cancellation."""
from __future__ import annotations
from threading import Lock

_PREPARED: set[str] = set()
_LOCK = Lock()

class CancelNotPrepared(RuntimeError):
    pass

def begin_cancel(*, chat_id: str) -> None:
    with _LOCK:
        _PREPARED.add(chat_id)

def commit_cancel(*, chat_id: str) -> None:
    with _LOCK:
        if chat_id not in _PREPARED:
            raise CancelNotPrepared(f"chat {chat_id} was not in prepared state")
        _PREPARED.discard(chat_id)

def abort_cancel(*, chat_id: str) -> None:
    with _LOCK:
        _PREPARED.discard(chat_id)
