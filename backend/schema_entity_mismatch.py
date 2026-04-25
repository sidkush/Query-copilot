"""Ring 4 Gate C — schema-entity-mismatch detector (W2 Task 1a).

Detects when a NL question references a person-class entity (rider, user,
customer, subscriber, ...) that has no matching id column in the schema.
When fired, the agent emits an `agent_checkpoint` (kind=schema_entity_mismatch)
asking the user to choose `station_proxy` or `abort`.

Hardenings folded in from adversarial Pass #1 + #2:
  * AMEND-W2-07 — TR39 confusable-fold + NFKC + casefold + word-boundary regex
  * AMEND-W2-11 — tightened suffix match (anchored, no bare endswith)
  * AMEND-W2-32 — CANONICAL_ENTITIES synonym map + extended id-suffix set
                   ({_id, _uuid, _hash, _code, _key, _ref, _sk, _pk})
  * AMEND-W2-35 — optional view/alias resolver expands view names to base
                   table columns before the id-column check

Detector returns `EntityMismatch | None`. None = no mismatch (gate skipped).
The detector is a pure function over (NL, schema, optional resolver) — all
tenant-scoping, consent-cache, and replan-budget logic lives at the call
site (T1d).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Callable, Iterable, Mapping, Optional


CANONICAL_ENTITIES: Mapping[str, frozenset[str]] = {
    "rider":      frozenset({"rider", "riders"}),
    "user":       frozenset({"user", "users"}),
    "customer":   frozenset({"customer", "customers"}),
    "person":     frozenset({"person", "people", "persons", "individual", "individuals"}),
    "employee":   frozenset({"employee", "employees", "worker", "workers", "staff"}),
    "subscriber": frozenset({"subscriber", "subscribers", "member", "members"}),
    "driver":     frozenset({"driver", "drivers"}),
    "passenger":  frozenset({"passenger", "passengers"}),
    "patient":    frozenset({"patient", "patients"}),
    "client":     frozenset({"client", "clients", "patron", "patrons", "guest", "guests"}),
}

ID_SUFFIXES: tuple[str, ...] = (
    "_id", "_uuid", "_hash", "_code", "_key", "_ref", "_sk", "_pk",
)

# Person-class equivalence for view-resolved base-table columns (AMEND-W2-35).
# A view named "active_riders" backed by `users(user_id, ...)` satisfies the
# rider entity because the view definition expresses "riders are users".
_PERSON_CLASS_CANONICALS: frozenset[str] = frozenset({
    "rider", "user", "customer", "person", "employee",
    "subscriber", "driver", "passenger", "patient", "client",
})

# Adjectival follow-words. When an entity term is immediately followed by one
# of these, treat it as an adjective ("user type breakdown") and skip detection.
_ADJECTIVAL_FOLLOWERS: frozenset[str] = frozenset({
    "type", "types", "category", "categories", "segment", "segments",
    "class", "classes", "tier", "tiers", "group", "groups", "kind", "kinds",
})

# All surface forms across every canonical.  When an entity synonym is
# immediately followed by ANOTHER entity surface form it is being used as an
# adjectival modifier ("individual rider", "person user"), not as the entity
# itself.  The following noun wins.  Computed here so it stays in sync with
# CANONICAL_ENTITIES automatically.
_ENTITY_SURFACE_FORMS: frozenset[str] = frozenset(
    sf for forms in CANONICAL_ENTITIES.values() for sf in forms
)


ViewResolver = Callable[[str], Optional[list[str]]]


@dataclass(frozen=True)
class EntityMismatch:
    """Result returned when Gate C should fire."""
    has_mismatch: bool
    entity_term: str       # surface form found in NL (e.g. "riders")
    canonical: str         # canonical entity (e.g. "rider")
    proxy_suggestions: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

# Cheap confusable-fold lookup. Full TR39 table is large; we cover the
# Cyrillic/Greek lowercase letters that visually collide with ASCII Latin —
# enough to defeat the homoglyph attacks A5 reproduced.
_CONFUSABLE_FOLD: dict[str, str] = {
    # Cyrillic
    "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p",
    "\u0441": "c", "\u0445": "x", "\u0443": "y", "\u0456": "i",
    "\u0451": "e", "\u0440": "p", "\u04bb": "h", "\u0455": "s",
    "\u0458": "j", "\u04cf": "l",
    # Greek
    "\u03bf": "o", "\u03b1": "a", "\u03b5": "e", "\u03b9": "i",
    "\u03c1": "p", "\u03c5": "u", "\u03c4": "t", "\u03ba": "k",
    # Fullwidth Latin (NFKC handles most of these; left as belt-and-braces)
    "\uff41": "a", "\uff45": "e", "\uff49": "i", "\uff4f": "o", "\uff55": "u",
}


def _normalize(text: str) -> str:
    """NFKC → casefold → confusable-fold → strip Cf/Cc/Mn categories."""
    if not text:
        return ""
    out = unicodedata.normalize("NFKC", text).casefold()
    out = "".join(_CONFUSABLE_FOLD.get(ch, ch) for ch in out)
    # Drop format/control/combining-mark codepoints used by ZWSP / RTL bypasses.
    out = "".join(ch for ch in out if unicodedata.category(ch) not in ("Cf", "Cc", "Mn"))
    return out


# ---------------------------------------------------------------------------
# Entity detection
# ---------------------------------------------------------------------------

def _all_surface_forms(canonical_map: Mapping[str, frozenset[str]]) -> list[tuple[str, str]]:
    """Flatten canonical_map → [(surface_form, canonical), ...] sorted by length
    desc so longer forms match before shorter ones (e.g. 'subscribers' before
    'subscriber')."""
    out: list[tuple[str, str]] = []
    for canon, forms in canonical_map.items():
        for sf in forms:
            out.append((sf, canon))
    out.sort(key=lambda p: -len(p[0]))
    return out


def _detect_entity(
    nl_norm: str,
    canonical_map: Mapping[str, frozenset[str]],
) -> Optional[tuple[str, str]]:
    """Return (surface_form, canonical) of the FIRST person-entity term that
    matches under word boundaries AND is not used adjectivally."""
    forms = _all_surface_forms(canonical_map)
    for surface, canonical in forms:
        # Word-boundary regex anchored on non-alphanumeric (so "username"
        # does not match "user"; "rіder" — already confusable-folded — matches
        # "rider").
        pattern = re.compile(rf"(?<![a-z0-9_]){re.escape(surface)}(?![a-z0-9_])")
        m = pattern.search(nl_norm)
        if not m:
            continue
        # Adjectival follow-word check: if next word ∈ _ADJECTIVAL_FOLLOWERS
        # OR ∈ _ENTITY_SURFACE_FORMS, the current token is being used as a
        # modifier ("user type breakdown", "individual rider") — the following
        # noun is the actual entity.  Skip this match and let the next
        # candidate win ("individual rider" → skip "individual", match "rider").
        tail = nl_norm[m.end():].lstrip()
        next_word = re.match(r"[a-z]+", tail)
        if next_word and (
            next_word.group(0) in _ADJECTIVAL_FOLLOWERS
            or next_word.group(0) in _ENTITY_SURFACE_FORMS
        ):
            continue
        return surface, canonical
    return None


# ---------------------------------------------------------------------------
# Id-column matching
# ---------------------------------------------------------------------------

def _column_satisfies_canonical(col: str, canonical: str, synonyms: Iterable[str]) -> bool:
    """AMEND-W2-32 + AMEND-W2-11: column matches canonical entity if it equals
    any synonym, or equals `<synonym><suffix>`, or has form `id_<synonym>`."""
    cl = col.lower()
    candidates = set(synonyms) | {canonical}
    for syn in candidates:
        if cl == syn or cl == f"id_{syn}":
            return True
        for sfx in ID_SUFFIXES:
            if cl == f"{syn}{sfx}" or cl.endswith(f"_{syn}{sfx}"):
                return True
    return False


def _has_matching_id(
    canonical: str,
    canonical_map: Mapping[str, frozenset[str]],
    columns: Iterable[str],
) -> bool:
    synonyms = canonical_map.get(canonical, frozenset({canonical}))
    for col in columns:
        if _column_satisfies_canonical(col, canonical, synonyms):
            return True
    return False


def _has_any_person_class_id(columns: Iterable[str]) -> bool:
    """AMEND-W2-35 helper: a view's base-table columns satisfy the person-entity
    if ANY person-class id column is present (rider→user mapping via view)."""
    for col in columns:
        for canon in _PERSON_CLASS_CANONICALS:
            synonyms = CANONICAL_ENTITIES.get(canon, frozenset({canon}))
            if _column_satisfies_canonical(col, canon, synonyms):
                return True
    return False


# ---------------------------------------------------------------------------
# Proxy suggestions
# ---------------------------------------------------------------------------

# Columns that work as group-by proxies. Excludes obviously non-person fkeys.
_PROXY_EXCLUDE_PREFIXES: tuple[str, ...] = (
    "ride_", "trip_", "event_", "order_", "transaction_", "session_",
)


def _proxy_columns(columns: Iterable[str]) -> tuple[str, ...]:
    out: list[str] = []
    for col in columns:
        cl = col.lower()
        if cl.endswith("_id") and not any(cl.startswith(p) for p in _PROXY_EXCLUDE_PREFIXES):
            out.append(col)
    return tuple(out)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class EntityDetector:
    """Stateless detector. Construct once per process; safe to share across
    sessions. Tenant-scoping happens at the registry layer (T1d, AMEND-W2-33)."""

    def __init__(
        self,
        canonical_map: Mapping[str, frozenset[str]] = CANONICAL_ENTITIES,
        view_resolver: Optional[ViewResolver] = None,
    ) -> None:
        self._canonical_map = canonical_map
        self._view_resolver = view_resolver

    def detect(
        self,
        nl: str,
        schema_columns: Iterable[str],
    ) -> Optional[EntityMismatch]:
        nl_norm = _normalize(nl)
        if not nl_norm:
            return None

        hit = _detect_entity(nl_norm, self._canonical_map)
        if hit is None:
            return None
        surface, canonical = hit

        cols = list(schema_columns)
        # Direct id-column check on the supplied columns (AMEND-W2-32).
        if _has_matching_id(canonical, self._canonical_map, cols):
            return None

        # AMEND-W2-35: schema_columns may include view/table names whose base
        # columns are exposed via the resolver. Expand views, then re-check
        # using the broader person-class equivalence (a view named
        # `active_riders` over `users(user_id)` satisfies rider).
        if self._view_resolver is not None:
            expanded: list[str] = list(cols)
            for name in cols:
                base = self._view_resolver(name)
                if base:
                    expanded.extend(base)
            if expanded != cols and _has_any_person_class_id(expanded):
                return None

        return EntityMismatch(
            has_mismatch=True,
            entity_term=surface,
            canonical=canonical,
            proxy_suggestions=_proxy_columns(cols),
        )


# Convenience wrapper retained for callers that prefer a function form.
def detect_entity_mismatch(
    nl: str,
    schema: dict[str, list[str]],
    *,
    view_resolver: Optional[ViewResolver] = None,
) -> Optional[EntityMismatch]:
    """Flatten {table: [cols]} schema and run the detector."""
    columns: list[str] = []
    for cols in schema.values():
        columns.extend(cols)
    return EntityDetector(view_resolver=view_resolver).detect(nl, columns)
