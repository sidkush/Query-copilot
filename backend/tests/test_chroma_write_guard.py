import pytest
from chroma_write_guard import guarded_add, NamespaceRejected


class FakeCollection:
    def __init__(self):
        self.calls = []
    def add(self, **kw):
        self.calls.append(kw)


def test_guarded_add_rejects_empty_namespace():
    coll = FakeCollection()
    with pytest.raises(NamespaceRejected):
        guarded_add(coll, namespace="", documents=["x"], ids=["1"])


def test_guarded_add_rejects_unprefixed():
    coll = FakeCollection()
    with pytest.raises(NamespaceRejected):
        guarded_add(coll, namespace="conn:X/user:Y", documents=["x"], ids=["1"])  # missing tenant:


def test_guarded_add_accepts_tenant_namespace():
    coll = FakeCollection()
    guarded_add(
        coll,
        namespace="tenant:t1/conn:c1/user:u1/coll:queries",
        documents=["x"],
        ids=["1"],
    )
    assert len(coll.calls) == 1
