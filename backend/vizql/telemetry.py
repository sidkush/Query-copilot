"""Plan 7e — QueryCategory telemetry enum (Build_Tableau.md §IV.11)."""
from __future__ import annotations

from enum import Enum


class QueryCategory(str, Enum):
    """Tableau-parity query category (§IV.11)."""
    MDX_SETUP = "MDX_SETUP"
    MDX_VALIDATION = "MDX_VALIDATION"
    NOW = "NOW"
    FILTER = "FILTER"
    IMPERSONATE = "IMPERSONATE"
    HYPER_STREAM = "HYPER_STREAM"
