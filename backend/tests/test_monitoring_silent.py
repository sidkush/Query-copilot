import time
import pytest


def test_watchdog_fires_after_window(monkeypatch):
    from audit_trail import (
        register_silence_watchdog,
        _reset_last_write,
        _check_silence_now,
    )
    _reset_last_write()
    monkeypatch.setattr("config.settings.AUDIT_SILENCE_WINDOW_SECONDS", 1)
    fired = []
    register_silence_watchdog(on_silent=lambda: fired.append(1))
    time.sleep(1.2)
    _check_silence_now()
    assert fired == [1]


def test_watchdog_no_fire_when_recent_write(monkeypatch):
    from audit_trail import (
        register_silence_watchdog,
        _reset_last_write,
        _touch_last_write,
        _check_silence_now,
    )
    _reset_last_write()
    monkeypatch.setattr("config.settings.AUDIT_SILENCE_WINDOW_SECONDS", 60)
    fired = []
    register_silence_watchdog(on_silent=lambda: fired.append(1))
    _touch_last_write()
    _check_silence_now()
    assert fired == []
