"""ChromaDB ingest for the skill library.

Embeds every skill file into a dedicated `skills_v1` ChromaDB collection,
isolated from the per-connection `schema_<id>` / `examples_<id>` /
`query_memory_<id>` collections. Uses contextual-retrieval prefix pattern
(research-context §3.2.4): prepends '[Category: <cat>] <name>: <desc>'
before the body so embeddings match queries that use the business
terminology rather than bare rules.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Optional

import frontmatter

from skill_library import SkillLibrary

logger = logging.getLogger(__name__)

COLLECTION_NAME = "skills_v1"
SHADOW_COLLECTION_NAME = "skills_v1_shadow"
_STAMP_FILENAME = ".skill_ingest_stamp"


def build_contextual_prefix(category: str, name: str, description: str) -> str:
    """Contextual prefix for embedding. Research-context §3.2.4."""
    return f"[Category: {category}] {name}: {description.strip()}\n\n"


def should_reingest(skills_root: Path, stamp_file: Path) -> bool:
    """True if any skill .md has mtime newer than the stamp file."""
    if not stamp_file.exists() or not stamp_file.read_text().strip():
        return True
    try:
        stamp = float(stamp_file.read_text().strip())
    except ValueError:
        return True
    newest = 0.0
    for path in skills_root.rglob("*.md"):
        if path.name == "MASTER_INDEX.md":
            continue
        newest = max(newest, path.stat().st_mtime)
    return newest > stamp


def ingest_library(
    library: SkillLibrary,
    chroma_client: Any,
    collection_name: str = COLLECTION_NAME,
) -> int:
    """Upsert every skill into the named collection. Returns count."""
    collection = chroma_client.get_or_create_collection(name=collection_name)

    documents: list[str] = []
    ids: list[str] = []
    metadatas: list[dict] = []
    for name in library.all_names():
        hit = library.get(name)
        if hit is None:
            continue
        # Re-parse frontmatter for description (not on SkillHit).
        post = frontmatter.load(hit.path)
        desc = str(post.metadata.get("description", ""))
        category = hit.path.parent.name
        prefix = build_contextual_prefix(category, name, desc)
        documents.append(prefix + hit.content)
        ids.append(f"skill::{name}")
        metadatas.append({
            "name": name,
            "category": category,
            "priority": hit.priority,
            "tokens": hit.tokens,
        })

    if documents:
        collection.upsert(documents=documents, ids=ids, metadatas=metadatas)
    logger.info("skill_ingest: upserted %d skills to %s", len(documents), collection_name)
    return len(documents)


def maybe_ingest(
    library: SkillLibrary,
    chroma_client: Any,
    stamp_dir: Path,
    collection_name: str = COLLECTION_NAME,
) -> int:
    """Ingest only if mtimes warrant it. Writes stamp on success."""
    stamp_file = stamp_dir / _STAMP_FILENAME
    if not should_reingest(library._root, stamp_file):  # noqa: SLF001
        logger.info("skill_ingest: up-to-date, skipping")
        return 0
    stamp_dir.mkdir(parents=True, exist_ok=True)
    count = ingest_library(library, chroma_client, collection_name=collection_name)
    stamp_file.write_text(str(os.path.getmtime(library._root)))  # noqa: SLF001
    return count


if __name__ == "__main__":  # pragma: no cover
    import chromadb
    logging.basicConfig(level=logging.INFO)
    from config import settings
    lib = SkillLibrary(root=Path(settings.SKILL_LIBRARY_PATH))
    client = chromadb.PersistentClient(path=".chroma/querycopilot")
    print(f"Ingested: {ingest_library(lib, client)}")
