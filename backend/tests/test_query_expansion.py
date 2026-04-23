from unittest.mock import MagicMock

import pytest

from query_expansion import QueryExpansion, _format_prompt


class _FakeProvider:
    def __init__(self, reply: str):
        self.reply = reply
        self.calls = 0

    def complete(self, *, model, system, messages, max_tokens, **kwargs):
        self.calls += 1
        r = MagicMock()
        r.text = self.reply
        return r


def test_format_prompt_includes_question_and_asks_for_synonyms():
    p = _format_prompt("top products last month")
    assert "top products last month" in p
    assert "synonym" in p.lower() or "paraphrase" in p.lower()


def test_expand_returns_expanded_string_on_success():
    fake = _FakeProvider("best, highest-selling, leading; paraphrase: which items sold the most recently")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=60)
    out = qe.expand("top products last month", tenant_id="t1")
    assert "top products last month" in out
    assert "best" in out or "paraphrase" in out
    assert fake.calls == 1


def test_expand_cache_hit_skips_provider():
    fake = _FakeProvider("x")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=60)
    qe.expand("abc", tenant_id="t1")
    qe.expand("abc", tenant_id="t1")
    assert fake.calls == 1


def test_expand_cache_keyed_by_tenant():
    fake = _FakeProvider("x")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=60)
    qe.expand("abc", tenant_id="t1")
    qe.expand("abc", tenant_id="t2")
    assert fake.calls == 2


def test_expand_fails_open_on_provider_error(caplog):
    class _Bad:
        def complete(self, **kw):
            raise RuntimeError("boom")
    qe = QueryExpansion(provider=_Bad(), max_tokens=200, ttl_s=60)
    with caplog.at_level("WARNING"):
        out = qe.expand("question?", tenant_id="t1")
    assert out == "question?"
    assert any("boom" in r.message or "expansion failed" in r.message for r in caplog.records)


def test_expand_respects_ttl():
    import time
    fake = _FakeProvider("x")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=0)
    qe.expand("abc", tenant_id="t1")
    time.sleep(0.01)
    qe.expand("abc", tenant_id="t1")
    assert fake.calls == 2


def test_expand_empty_question_short_circuits_no_llm_call():
    fake = _FakeProvider("x")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=60)
    out = qe.expand("", tenant_id="t1")
    assert out == ""
    assert fake.calls == 0


def test_expand_passes_max_tokens_to_provider():
    class _Spy:
        def __init__(self):
            self.max_tokens = None
        def complete(self, *, model, system, messages, max_tokens, **kwargs):
            self.max_tokens = max_tokens
            r = MagicMock(); r.text = "ok"
            return r
    spy = _Spy()
    qe = QueryExpansion(provider=spy, max_tokens=200, ttl_s=60)
    qe.expand("q", tenant_id="t1")
    assert spy.max_tokens == 200
