# backend/vizql/format_resolver.py
"""Plan 10a — memoised layered format resolver.

Walk order (most-specific first):
    Mark > Field > Worksheet > Data Source > Workbook > default.

Memoisation keyed on (mark_id, field_id, sheet_id, ds_id, prop).
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Iterable, Mapping, Optional

from vizql.formatting_types import (
    DataSourceSelector,
    FieldSelector,
    MarkSelector,
    Selector,
    StyleProp,
    StyleRule,
    WorkbookSelector,
    WorksheetSelector,
)

logger = logging.getLogger(__name__)

# Allowed primitive types for StyleRule property values. Anything else
# (callables, custom objects, None sentinels) is rejected at ingest to keep
# memoisation safe and serialisation deterministic.
_ALLOWED_VALUE_TYPES = (str, int, float, bool, tuple)


class ResolverError(ValueError):
    """Raised for invalid rule shapes or invalid resolve arguments."""


class FormatResolver:
    def __init__(
        self,
        rules: Iterable[StyleRule],
        *,
        cache_enabled: bool = True,
        cache_maxsize: int = 4096,
    ) -> None:
        self._cache_enabled = cache_enabled
        self._cache_maxsize = cache_maxsize
        self.update_rules(rules)

    # --- Public API ------------------------------------------------------

    def update_rules(self, rules: Iterable[StyleRule]) -> None:
        flat = list(rules)
        self._validate(flat)
        # Pre-bucket rules by selector kind → (key → rule) for O(1) lookup.
        self._by_mark: dict[str, list[StyleRule]] = {}
        self._by_field: dict[str, list[StyleRule]] = {}
        self._by_sheet: dict[str, list[StyleRule]] = {}
        self._by_ds: dict[str, list[StyleRule]] = {}
        self._workbook: list[StyleRule] = []
        for rule in flat:
            self._bucket(rule)
        self._rules = flat
        self._reset_cache()

    def resolve(
        self,
        mark_id: Optional[str],
        field_id: Optional[str],
        sheet_id: Optional[str],
        ds_id: Optional[str],
        prop: StyleProp,
        *,
        default: object = None,
    ) -> object:
        if not isinstance(prop, StyleProp):
            raise ResolverError(f"resolve: prop must be StyleProp, got {type(prop).__name__}")
        if self._cache_enabled:
            return self._resolve_cached(mark_id, field_id, sheet_id, ds_id, prop, default)
        return self._resolve_uncached(mark_id, field_id, sheet_id, ds_id, prop, default)

    def resolve_all(
        self,
        mark_id: Optional[str],
        field_id: Optional[str],
        sheet_id: Optional[str],
        ds_id: Optional[str],
    ) -> Mapping[StyleProp, object]:
        out: dict[StyleProp, object] = {}
        for prop in StyleProp:
            val = self.resolve(mark_id, field_id, sheet_id, ds_id, prop, default=_UNSET)
            if val is not _UNSET:
                out[prop] = val
        return out

    def resolve_all_with_source(
        self,
        mark_id: Optional[str],
        field_id: Optional[str],
        sheet_id: Optional[str],
        ds_id: Optional[str],
    ) -> Mapping[StyleProp, tuple[object, str]]:
        out: dict[StyleProp, tuple[object, str]] = {}
        for prop in StyleProp:
            result = self._resolve_uncached_with_source(
                mark_id, field_id, sheet_id, ds_id, prop
            )
            if result is not None:
                out[prop] = result
        return out

    def cache_info(self) -> dict[str, int]:
        if not self._cache_enabled:
            return {"hits": 0, "misses": 0, "maxsize": 0, "currsize": 0}
        info = self._resolve_cached.cache_info()
        return {
            "hits": info.hits,
            "misses": info.misses,
            "maxsize": info.maxsize,
            "currsize": info.currsize,
        }

    # --- Internal --------------------------------------------------------

    def _validate(self, rules: list[StyleRule]) -> None:
        for rule in rules:
            if not isinstance(rule, StyleRule):
                raise ResolverError(f"expected StyleRule, got {type(rule).__name__}")
            for prop, value in rule.properties.items():
                if not isinstance(prop, StyleProp):
                    raise ResolverError(f"property key must be StyleProp, got {prop!r}")
                if not isinstance(value, _ALLOWED_VALUE_TYPES):
                    raise ResolverError(
                        f"property value must be primitive (str/int/float/bool/tuple); got {type(value).__name__}"
                    )

    def _bucket(self, rule: StyleRule) -> None:
        s = rule.selector
        if isinstance(s, MarkSelector):
            self._by_mark.setdefault(s.mark_id, []).append(rule)
        elif isinstance(s, FieldSelector):
            self._by_field.setdefault(s.field_id, []).append(rule)
        elif isinstance(s, WorksheetSelector):
            self._by_sheet.setdefault(s.sheet_id, []).append(rule)
        elif isinstance(s, DataSourceSelector):
            self._by_ds.setdefault(s.ds_id, []).append(rule)
        elif isinstance(s, WorkbookSelector):
            self._workbook.append(rule)
        else:
            raise ResolverError(f"unknown selector type: {type(s).__name__}")

    def _reset_cache(self) -> None:
        if self._cache_enabled:
            @lru_cache(maxsize=self._cache_maxsize)
            def _inner(mark_id, field_id, sheet_id, ds_id, prop, default):
                return self._resolve_uncached(mark_id, field_id, sheet_id, ds_id, prop, default)
            self._resolve_cached = _inner

    def _layer_chain(
        self, mark_id, field_id, sheet_id, ds_id
    ) -> list[tuple[str, list[StyleRule]]]:
        # Walk most-specific → least-specific.
        return [
            ("mark", self._by_mark.get(mark_id, []) if mark_id else []),
            ("field", self._by_field.get(field_id, []) if field_id else []),
            ("sheet", self._by_sheet.get(sheet_id, []) if sheet_id else []),
            ("ds", self._by_ds.get(ds_id, []) if ds_id else []),
            ("workbook", self._workbook),
        ]

    def _resolve_uncached(self, mark_id, field_id, sheet_id, ds_id, prop, default):
        for _layer, bucket in self._layer_chain(mark_id, field_id, sheet_id, ds_id):
            # Multiple rules at same layer → last wins (most recent override).
            for rule in reversed(bucket):
                if prop in rule.properties:
                    return rule.properties[prop]
        return default

    def _resolve_uncached_with_source(self, mark_id, field_id, sheet_id, ds_id, prop):
        for layer, bucket in self._layer_chain(mark_id, field_id, sheet_id, ds_id):
            for rule in reversed(bucket):
                if prop in rule.properties:
                    return rule.properties[prop], layer
        return None


_UNSET = object()
