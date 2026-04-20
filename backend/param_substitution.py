"""
param_substitution.py — safe `{{name}}` token substitution for Analyst Pro
parameters. Runs BEFORE SQLValidator so the validator sees the final SQL.

- Token regex: r"\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}" .
- Unknown tokens raise UnknownParameterError. No silent pass-through.
- string / date values are single-quote-escaped and wrapped in quotes.
- number values must be finite; repr() renders them.
- boolean values render as TRUE / FALSE.
- Post-substitution length is capped at MAX_SUBSTITUTED_SQL_LEN.

This module performs no execution — it returns a new SQL string.
"""

from __future__ import annotations

import math
import re
from typing import Any, Iterable, Mapping

_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_TOKEN_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")
_ISO_DATE_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$"
)

MAX_SUBSTITUTED_SQL_LEN = 100_000
MAX_PARAM_TOKEN_LENGTH = 64


class UnknownParameterError(ValueError):
    """Raised when a {{name}} token has no matching parameter."""


class InvalidParameterError(ValueError):
    """Raised when a parameter dict is malformed or a value is out of range."""


def _render_literal(param: Mapping[str, Any]) -> str:
    ptype = param.get("type")
    value = param.get("value")
    name = param.get("name", "?")

    if ptype == "boolean":
        if not isinstance(value, bool):
            raise InvalidParameterError(
                f"Parameter {name!r} type=boolean but value is {type(value).__name__}"
            )
        return "TRUE" if value else "FALSE"

    if ptype == "number":
        if isinstance(value, bool):  # bool is int subclass — exclude
            raise InvalidParameterError(
                f"Parameter {name!r} type=number received a boolean value"
            )
        if not isinstance(value, (int, float)):
            raise InvalidParameterError(
                f"Parameter {name!r} type=number but value is {type(value).__name__}"
            )
        if not math.isfinite(float(value)):
            raise InvalidParameterError(
                f"Parameter {name!r} type=number must be finite"
            )
        return repr(value)

    if ptype == "string":
        s = value if isinstance(value, str) else str(value)
        escaped = s.replace("'", "''")
        return f"'{escaped}'"

    if ptype == "date":
        if not isinstance(value, str) or not _ISO_DATE_RE.match(value):
            raise InvalidParameterError(
                f"Parameter {name!r} type=date must be ISO-8601"
            )
        escaped = value.replace("'", "''")
        return f"'{escaped}'"

    raise InvalidParameterError(
        f"Parameter {name!r} has unknown type {ptype!r}"
    )


def _normalize_params(
    parameters: Iterable[Mapping[str, Any]] | Mapping[str, Mapping[str, Any]] | None,
) -> dict[str, Mapping[str, Any]]:
    """
    Accept either an iterable of param dicts or a {name: param_dict} mapping.
    Returns {name: param_dict} limited to parameters whose name is a valid
    plain SQL identifier (invalid ones are silently dropped so the token
    substitution step can report them as unknown if referenced).
    """
    if parameters is None:
        return {}
    by_name: dict[str, Mapping[str, Any]] = {}
    if isinstance(parameters, Mapping):
        iterable = parameters.values()
    else:
        iterable = parameters
    for p in iterable:
        if not isinstance(p, Mapping):
            continue
        name = p.get("name")
        if not isinstance(name, str) or not _IDENT_RE.match(name):
            continue
        if len(name) > MAX_PARAM_TOKEN_LENGTH:
            continue
        by_name[name] = p
    return by_name


def substitute_param_tokens(
    sql: str,
    parameters: Iterable[Mapping[str, Any]]
    | Mapping[str, Mapping[str, Any]]
    | None,
) -> str:
    """
    Replace every `{{name}}` token in *sql* with the matching parameter's
    SQL literal. Raises UnknownParameterError when a referenced token has
    no matching parameter, and InvalidParameterError when a parameter is
    malformed or produces a value longer than MAX_SUBSTITUTED_SQL_LEN.
    """
    if not isinstance(sql, str):
        raise InvalidParameterError("sql must be a string")
    if "{{" not in sql:
        return sql

    by_name = _normalize_params(parameters)
    errors: list[Exception] = []

    def _repl(match: re.Match[str]) -> str:
        name = match.group(1)
        param = by_name.get(name)
        if param is None:
            errors.append(UnknownParameterError(f"Unknown parameter token: {{{{{name}}}}}"))
            return ""
        try:
            return _render_literal(param)
        except Exception as exc:  # noqa: BLE001 — re-raised below
            errors.append(exc)
            return ""

    replaced = _TOKEN_RE.sub(_repl, sql)

    if errors:
        # Surface the first error (deterministic).
        raise errors[0]

    if len(replaced) > MAX_SUBSTITUTED_SQL_LEN:
        raise InvalidParameterError(
            f"Substituted SQL exceeds {MAX_SUBSTITUTED_SQL_LEN} chars"
        )
    return replaced


def format_as_literal(value: Any, ptype: str) -> str:
    """Public wrapper around `_render_literal`. The single source of truth for
    SQL literal formatting in calc-expression compilation (Plan 8a).
    NEVER interpolate user values without going through this helper.

    Normalises calc-catalogue type names onto `_render_literal`'s vocabulary:
      - ``integer``/``real``/``float`` → ``number``
      - ``datetime`` → ``date`` (ISO-8601 string)
    Other types pass through untouched.
    """
    # Normalise calc-AST type vocabulary onto _render_literal's vocabulary.
    if ptype in ("integer", "real", "float"):
        ptype = "number"
    elif ptype == "datetime":
        ptype = "date"
    return _render_literal({"type": ptype, "value": value})
