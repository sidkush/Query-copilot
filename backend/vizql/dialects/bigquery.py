from ..dialect_base import BaseDialect

class BigQueryDialect(BaseDialect):
    name = "bigquery"
    # All format_* bodies land in Task 6; this stub keeps the import live.
    def format_select(self, qf): raise NotImplementedError
    def format_join(self, j): raise NotImplementedError
    def format_case(self, c): raise NotImplementedError
    def format_simple_case(self, c): raise NotImplementedError
    def format_aggregate(self, f): raise NotImplementedError
    def format_window(self, w): raise NotImplementedError
    def format_cast(self, c): raise NotImplementedError
    def format_drop_column(self, table, column): raise NotImplementedError
    def format_table_dee(self): raise NotImplementedError
    def format_default_from_clause(self): raise NotImplementedError
    def format_set_isolation_level(self, level): raise NotImplementedError
    def format_boolean_attribute(self, v): raise NotImplementedError
    def format_float_attribute(self, v): raise NotImplementedError
    def format_integer_attribute(self, v): raise NotImplementedError
    def format_int64_attribute(self, v): raise NotImplementedError
    def format_top_clause(self, n): raise NotImplementedError
    def format_offset_clause(self, n): raise NotImplementedError
    def format_string_literal(self, v): raise NotImplementedError
    def format_identifier(self, ident): raise NotImplementedError
    def format_date_trunc(self, part, expr): raise NotImplementedError
    def format_datediff(self, part, a, b): raise NotImplementedError
    def format_extract(self, part, expr): raise NotImplementedError
    def format_current_timestamp(self): raise NotImplementedError
    def format_interval(self, part, n): raise NotImplementedError
