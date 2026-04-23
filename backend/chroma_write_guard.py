"""Phase H — H21: ChromaDB write ACL.

Every write goes through `guarded_add` / `guarded_upsert` which rejects
any call whose `namespace` doesn't start with `tenant:` (Ring 6 contract
from Phase E `tenant_fortress.chroma_namespace`).
"""
from __future__ import annotations


class NamespaceRejected(ValueError):
    pass


def _check(ns: str) -> None:
    if not ns or not ns.startswith("tenant:"):
        raise NamespaceRejected(f"namespace must start with tenant: (got {ns!r})")


def guarded_add(collection, *, namespace: str, **kwargs) -> None:
    _check(namespace)
    collection.add(**kwargs)


def guarded_upsert(collection, *, namespace: str, **kwargs) -> None:
    _check(namespace)
    collection.upsert(**kwargs)
