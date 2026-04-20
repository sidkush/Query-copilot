# Calc Language Reference (Plan 8a)

Tableau-compatible expression language for calculated fields. Parser at
`backend/vizql/calc_parser.py`; function catalogue at
`backend/vizql/calc_functions.py`; typechecker at `backend/vizql/calc_typecheck.py`;
SQL emitter at `backend/vizql/calc_to_expression.py`.

## Grammar (EBNF)

```
expr        ::= or_expr
or_expr     ::= and_expr ( "OR" and_expr )*
and_expr    ::= in_expr ( "AND" in_expr )*
in_expr     ::= cmp_expr ( "IN" "(" expr ( "," expr )* ")" )?
cmp_expr    ::= add_expr ( ("=" | "<>" | "<" | "<=" | ">" | ">=") add_expr )*
add_expr    ::= mul_expr ( ("+" | "-") mul_expr )*
mul_expr    ::= unary    ( ("*" | "/") unary )*
unary       ::= ("-" | "NOT") unary | primary
primary     ::= literal
              | field_ref
              | param_ref
              | fn_call
              | if_expr
              | case_expr
              | lod_expr
              | "(" expr ")"

literal     ::= NUMBER | STRING | "TRUE" | "FALSE" | "NULL"
field_ref   ::= "[" IDENT_RUN "]" | IDENT
param_ref   ::= "<Parameters." IDENT ">" | "[Parameters]" "." "[" IDENT "]"
fn_call     ::= IDENT "(" ( expr ( "," expr )* )? ")"
if_expr     ::= "IF" expr "THEN" expr ( "ELSEIF" expr "THEN" expr )* ( "ELSE" expr )? "END"
case_expr   ::= "CASE" expr? ( "WHEN" expr "THEN" expr )+ ( "ELSE" expr )? "END"
lod_expr    ::= "{" ("FIXED"|"INCLUDE"|"EXCLUDE") ( field_ref ("," field_ref)* )? ":" expr "}"
```

Comments: `// line` or `-- line`. Strings: `"…"` or `'…'`, `\\` and `\"` escapes.

## Function catalogue

See `calc_functions.py :: FUNCTIONS`. Categories cover every entry from
`docs/Build_Tableau.md` §V.1: Aggregate, Logical, String, Date,
Type-conversion, User, Spatial, Passthrough (RAWSQL_*), Analytics-ext
(SCRIPT_*), Table-calc names (full semantics in Plan 8c).

Canonical names follow Tableau spelling: `STARTSWITH` (not `STARTS_WITH`),
`COUNTD` (not `COUNT_DISTINCT`), `DATETRUNC` (not `DATE_TRUNC`).

## Differences from Tableau (known gaps)

- `RAWSQL_*` requires `FEATURE_RAWSQL_ENABLED=true` (default off).
- `SCRIPT_REAL` / `SCRIPT_STR` / `SCRIPT_INT` / `SCRIPT_BOOL` parse + typecheck
  but cannot compile until Phase 12 (analytics extension bridge).
- Table calculations (`RUNNING_*`, `WINDOW_*`, `INDEX`, `RANK*`, `TOTAL`,
  `PCT_TOTAL`, `DIFF`, `LOOKUP`, `PREVIOUS_VALUE`, `FIRST`, `LAST`, `SIZE`)
  parse + typecheck via Plan 8a; window-frame compilation lands in Plan 8c.
- `FIXED` LOD parses + typechecks here; correlated-subquery lowering in Plan 8b.
- `INCLUDE` / `EXCLUDE` LOD compile to a `Window` node (Plan 7c sql_ast)
  with `partition_bys` set from LOD dims; final `OVER (PARTITION BY …)`
  emission belongs to Plan 7d.
- No spatial-aggregate execution until DuckDB spatial extension is loaded
  per-connection (Phase 11).
- Custom Tableau type-coerce shorthand `[Field].[YEAR]` is NOT supported;
  use `YEAR([Field])` instead.

## Security

- Field identifiers and parameter values NEVER interpolate raw into SQL.
  All literals route through `param_substitution.format_as_literal()`.
- Endpoint `/api/v1/calcs/validate` is rate-limited per user
  (`CALC_RATE_LIMIT_PER_30S` default 10).
- Formulas longer than `MAX_CALC_FORMULA_LEN` (10_000) are rejected at the
  endpoint with HTTP 413.
- Parser depth capped at `MAX_CALC_NESTING` (32) to prevent stack abuse.
