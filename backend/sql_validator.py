"""
SQL Validator — Multi-layer security for generated SQL.
Prevents destructive operations, enforces LIMIT, detects injection patterns.
Uses sqlglot for real AST parsing.
"""

import sqlglot
from sqlglot import exp
from typing import Tuple, Optional
import re
import logging

from config import settings

logger = logging.getLogger(__name__)


class SQLValidationError(Exception):
    pass


class SQLValidator:
    DANGEROUS_FUNCTIONS = {
        "pg_sleep", "sleep", "benchmark", "load_file",
        "into outfile", "into dumpfile", "pg_read_file",
        "pg_write_file", "lo_import", "lo_export",
        "dblink", "copy", "pg_execute_server_program",
    }

    DIALECT_MAP = {
        # Relational
        "postgresql": "postgres",
        "mysql": "mysql",
        "mariadb": "mysql",
        "sqlite": "sqlite",
        "mssql": "tsql",
        "cockroachdb": "postgres",
        # Cloud Data Warehouses
        "snowflake": "snowflake",
        "bigquery": "bigquery",
        "redshift": "redshift",
        "databricks": "databricks",
        # Analytics Engines
        "clickhouse": "clickhouse",
        "duckdb": "duckdb",
        "trino": "trino",
        # Enterprise
        "oracle": "oracle",
        "sap_hana": "postgres",
        "ibm_db2": "postgres",
    }

    def __init__(self, dialect: str = "postgres", max_rows: Optional[int] = None,
                 allowlist_mode: Optional[bool] = None, allowed_tables: Optional[list] = None):
        self.dialect = self.DIALECT_MAP.get(dialect, dialect)
        self.max_rows = max_rows or settings.MAX_ROWS
        self.blocked_keywords = [kw.upper() for kw in settings.BLOCKED_KEYWORDS]
        self.allowlist_mode = allowlist_mode if allowlist_mode is not None else settings.SQL_ALLOWLIST_MODE
        self.allowed_tables = {t.lower() for t in (allowed_tables or settings.SQL_ALLOWED_TABLES)}

    def validate(self, sql: str) -> Tuple[bool, str, Optional[str]]:
        try:
            sql = sql.strip().rstrip(";")
            if not sql:
                return False, sql, "Empty SQL query"

            if ";" in sql:
                return False, sql, "Multi-statement queries are not allowed"

            sql_upper = sql.upper()
            for keyword in self.blocked_keywords:
                pattern = r'\b' + re.escape(keyword) + r'\b'
                if re.search(pattern, sql_upper):
                    return False, sql, f"Blocked operation detected: {keyword}"

            sql_lower = sql.lower()
            for func in self.DANGEROUS_FUNCTIONS:
                if func in sql_lower:
                    return False, sql, f"Dangerous function detected: {func}"

            try:
                parsed = sqlglot.parse(sql, dialect=self.dialect)
            except sqlglot.errors.ParseError as e:
                return False, sql, f"SQL syntax error: {str(e)}"

            if not parsed or len(parsed) == 0:
                return False, sql, "Failed to parse SQL"
            if len(parsed) > 1:
                return False, sql, "Multiple statements detected"

            statement = parsed[0]

            if not isinstance(statement, (exp.Select, exp.Union, exp.Intersect, exp.Except)):
                if isinstance(statement, exp.Subqueryable):
                    pass
                else:
                    return False, sql, f"Only SELECT queries allowed. Got: {type(statement).__name__}"

            for node in statement.walk():
                if isinstance(node, (exp.Delete, exp.Update, exp.Insert, exp.Drop, exp.Create, exp.Alter,
                                     exp.Grant, exp.Command, exp.Merge)):
                    return False, sql, f"Destructive operation found in subquery: {type(node).__name__}"

            # Table allowlist enforcement (opt-in via SQL_ALLOWLIST_MODE)
            # Empty allowed_tables with allowlist_mode=True means deny ALL tables
            if self.allowlist_mode:
                for node in statement.find_all(exp.Table):
                    table_name = node.name.lower() if node.name else ""
                    if table_name and table_name not in self.allowed_tables:
                        return False, sql, f"Table '{node.name}' is not in the allowed tables list"

            # Sanitize OFFSET — replace non-literal OFFSET with 0 to prevent subquery side-channels
            existing_offset = statement.find(exp.Offset)
            if existing_offset:
                offset_val = existing_offset.expression
                if not isinstance(offset_val, exp.Literal):
                    existing_offset.set("expression", exp.Literal.number(0))

            clean_sql = self._enforce_limit(statement)
            return True, clean_sql, None

        except Exception as e:
            logger.error(f"Validation error: {e}")
            return False, sql, f"Validation error: {str(e)}"

    def _enforce_limit(self, statement: exp.Expression) -> str:
        existing_limit = statement.find(exp.Limit)
        if existing_limit:
            limit_val = existing_limit.expression
            if isinstance(limit_val, exp.Literal):
                try:
                    if int(limit_val.this) > self.max_rows:
                        existing_limit.set("expression", exp.Literal.number(self.max_rows))
                except (ValueError, TypeError):
                    # Non-parseable literal — replace with safe cap
                    existing_limit.set("expression", exp.Literal.number(self.max_rows))
            else:
                # Non-literal LIMIT (subquery, expression, CAST, etc.) — replace with safe cap
                existing_limit.set("expression", exp.Literal.number(self.max_rows))
        else:
            statement = statement.limit(self.max_rows)
        return statement.sql(dialect=self.dialect)

    def format_sql(self, sql: str) -> str:
        try:
            return sqlglot.transpile(sql, read=self.dialect, write=self.dialect, pretty=True)[0]
        except Exception:
            return sql
