// Mirrors backend/vizql/calc_functions.py FUNCTIONS dict. Source of truth is
// the backend catalogue — this TS copy exists only for client-side tokenizer +
// completion + signature + hover providers. Regenerate if calc_functions.py
// adds / removes / retypes a function; keep both sides in lock-step.

export type CalcCategory =
  | 'aggregate'
  | 'logical'
  | 'string'
  | 'date'
  | 'type'
  | 'user'
  | 'table_calc'
  | 'lod'
  | 'spatial'
  | 'passthrough';

export interface CalcFunctionDef {
  name: string;
  category: CalcCategory;
  signature: string;
  minArgs: number;
  maxArgs: number; // -1 = variadic
  returnType: 'number' | 'string' | 'boolean' | 'date' | 'datetime' | 'spatial' | 'same_as_arg';
  docstring: string;
}

const AGG = ['SUM', 'AVG', 'MIN', 'MAX', 'MEDIAN', 'STDEV', 'STDEVP', 'VAR', 'VARP',
             'KURTOSIS', 'SKEWNESS'];

export const CALC_FUNCTIONS: readonly CalcFunctionDef[] = Object.freeze([
  ...AGG.map<CalcFunctionDef>((name) => ({
    name, category: 'aggregate',
    signature: `${name}(expression)`,
    minArgs: 1, maxArgs: 1, returnType: 'number',
    docstring: `${name} aggregation — operates on the viz level of granularity.`,
  })),
  { name: 'COUNT',  category: 'aggregate', signature: 'COUNT(expression)',          minArgs: 1, maxArgs: 1, returnType: 'number',      docstring: 'Count non-null values.' },
  { name: 'COUNTD', category: 'aggregate', signature: 'COUNTD(expression)',         minArgs: 1, maxArgs: 1, returnType: 'number',      docstring: 'Count distinct non-null values.' },
  { name: 'ATTR',   category: 'aggregate', signature: 'ATTR(expression)',           minArgs: 1, maxArgs: 1, returnType: 'same_as_arg', docstring: 'Return the value if all rows agree, else *.' },
  { name: 'PERCENTILE', category: 'aggregate', signature: 'PERCENTILE(expression, p)', minArgs: 2, maxArgs: 2, returnType: 'number',   docstring: 'Value at percentile p in [0,1].' },
  { name: 'COLLECT',    category: 'aggregate', signature: 'COLLECT(geometry)',         minArgs: 1, maxArgs: 1, returnType: 'spatial',  docstring: 'Aggregate spatial geometries.' },

  // Logical
  { name: 'IF',     category: 'logical', signature: 'IF cond THEN a [ELSEIF ...] [ELSE b] END', minArgs: 2, maxArgs: -1, returnType: 'same_as_arg', docstring: 'Conditional expression. Use IF/THEN/ELSEIF/ELSE/END.' },
  { name: 'CASE',   category: 'logical', signature: 'CASE scrutinee WHEN v THEN a [ELSE b] END', minArgs: 1, maxArgs: -1, returnType: 'same_as_arg', docstring: 'Case expression.' },
  { name: 'IIF',    category: 'logical', signature: 'IIF(cond, then, else, [unknown])', minArgs: 3, maxArgs: 4, returnType: 'same_as_arg', docstring: 'Inline conditional.' },
  { name: 'IFNULL', category: 'logical', signature: 'IFNULL(a, b)',                  minArgs: 2, maxArgs: 2, returnType: 'same_as_arg', docstring: 'Return a if not null, else b.' },
  { name: 'ZN',     category: 'logical', signature: 'ZN(expression)',                minArgs: 1, maxArgs: 1, returnType: 'number',      docstring: 'Coerce NULL to 0.' },
  { name: 'ISNULL', category: 'logical', signature: 'ISNULL(expression)',            minArgs: 1, maxArgs: 1, returnType: 'boolean',     docstring: 'Null check.' },
  { name: 'NOT',    category: 'logical', signature: 'NOT(expression)',               minArgs: 1, maxArgs: 1, returnType: 'boolean',     docstring: 'Logical negation.' },
  { name: 'IN',     category: 'logical', signature: 'IN(expression, values...)',     minArgs: 2, maxArgs: -1, returnType: 'boolean',    docstring: 'Membership test.' },

  // Type conversion
  { name: 'STR',      category: 'type', signature: 'STR(value)',      minArgs: 1, maxArgs: 1, returnType: 'string',   docstring: 'Cast to string.' },
  { name: 'INT',      category: 'type', signature: 'INT(value)',      minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Cast to integer.' },
  { name: 'FLOAT',    category: 'type', signature: 'FLOAT(value)',    minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Cast to float.' },
  { name: 'BOOL',     category: 'type', signature: 'BOOL(value)',     minArgs: 1, maxArgs: 1, returnType: 'boolean',  docstring: 'Cast to boolean.' },
  { name: 'DATE',     category: 'type', signature: 'DATE(value)',     minArgs: 1, maxArgs: 1, returnType: 'date',     docstring: 'Cast to date.' },
  { name: 'DATETIME', category: 'type', signature: 'DATETIME(value)', minArgs: 1, maxArgs: 1, returnType: 'datetime', docstring: 'Cast to datetime.' },

  // String
  { name: 'LEN',            category: 'string', signature: 'LEN(string)',                     minArgs: 1, maxArgs: 1, returnType: 'number',  docstring: 'Character length.' },
  { name: 'LEFT',           category: 'string', signature: 'LEFT(string, n)',                 minArgs: 2, maxArgs: 2, returnType: 'string',  docstring: 'First n characters.' },
  { name: 'RIGHT',          category: 'string', signature: 'RIGHT(string, n)',                minArgs: 2, maxArgs: 2, returnType: 'string',  docstring: 'Last n characters.' },
  { name: 'MID',            category: 'string', signature: 'MID(string, start, [length])',    minArgs: 2, maxArgs: 3, returnType: 'string',  docstring: 'Substring from position.' },
  { name: 'REPLACE',        category: 'string', signature: 'REPLACE(string, find, replace)',  minArgs: 3, maxArgs: 3, returnType: 'string',  docstring: 'Replace all occurrences.' },
  { name: 'UPPER',          category: 'string', signature: 'UPPER(string)',                   minArgs: 1, maxArgs: 1, returnType: 'string',  docstring: 'Uppercase.' },
  { name: 'LOWER',          category: 'string', signature: 'LOWER(string)',                   minArgs: 1, maxArgs: 1, returnType: 'string',  docstring: 'Lowercase.' },
  { name: 'LTRIM',          category: 'string', signature: 'LTRIM(string)',                   minArgs: 1, maxArgs: 1, returnType: 'string',  docstring: 'Strip leading whitespace.' },
  { name: 'RTRIM',          category: 'string', signature: 'RTRIM(string)',                   minArgs: 1, maxArgs: 1, returnType: 'string',  docstring: 'Strip trailing whitespace.' },
  { name: 'TRIM',           category: 'string', signature: 'TRIM(string)',                    minArgs: 1, maxArgs: 1, returnType: 'string',  docstring: 'Strip leading + trailing whitespace.' },
  { name: 'STARTSWITH',     category: 'string', signature: 'STARTSWITH(string, prefix)',      minArgs: 2, maxArgs: 2, returnType: 'boolean', docstring: 'Prefix check.' },
  { name: 'ENDSWITH',       category: 'string', signature: 'ENDSWITH(string, suffix)',        minArgs: 2, maxArgs: 2, returnType: 'boolean', docstring: 'Suffix check.' },
  { name: 'CONTAINS',       category: 'string', signature: 'CONTAINS(string, substr)',        minArgs: 2, maxArgs: 2, returnType: 'boolean', docstring: 'Substring check.' },
  { name: 'SPLIT',          category: 'string', signature: 'SPLIT(string, delim, tokenIdx)',  minArgs: 3, maxArgs: 3, returnType: 'string',  docstring: 'Split and return token.' },
  { name: 'FIND',           category: 'string', signature: 'FIND(string, substr)',            minArgs: 2, maxArgs: 2, returnType: 'number',  docstring: 'Position of substring.' },
  { name: 'REGEXP_EXTRACT', category: 'string', signature: 'REGEXP_EXTRACT(string, pattern)', minArgs: 2, maxArgs: 2, returnType: 'string',  docstring: 'Extract regex match.' },
  { name: 'REGEXP_MATCH',   category: 'string', signature: 'REGEXP_MATCH(string, pattern)',   minArgs: 2, maxArgs: 2, returnType: 'boolean', docstring: 'Regex test.' },
  { name: 'REGEXP_REPLACE', category: 'string', signature: 'REGEXP_REPLACE(string, pattern, replace)', minArgs: 3, maxArgs: 3, returnType: 'string', docstring: 'Regex replace.' },

  // Date
  { name: 'DATEDIFF',     category: 'date', signature: "DATEDIFF('unit', start, end, ['startOfWeek'])", minArgs: 3, maxArgs: 4, returnType: 'number',   docstring: 'Difference in units (year/month/day/hour...).' },
  { name: 'DATETRUNC',    category: 'date', signature: "DATETRUNC('unit', date, ['startOfWeek'])",     minArgs: 2, maxArgs: 3, returnType: 'datetime', docstring: 'Truncate to unit.' },
  { name: 'DATEPART',     category: 'date', signature: "DATEPART('unit', date, ['startOfWeek'])",      minArgs: 2, maxArgs: 3, returnType: 'number',   docstring: 'Extract date part.' },
  { name: 'DATEADD',      category: 'date', signature: "DATEADD('unit', delta, date)",                 minArgs: 3, maxArgs: 3, returnType: 'datetime', docstring: 'Shift date.' },
  { name: 'DATENAME',     category: 'date', signature: "DATENAME('unit', date, ['startOfWeek'])",      minArgs: 2, maxArgs: 3, returnType: 'string',   docstring: 'Name of date part.' },
  { name: 'MAKEDATE',     category: 'date', signature: 'MAKEDATE(year, month, day)',                   minArgs: 3, maxArgs: 3, returnType: 'date',     docstring: 'Construct date.' },
  { name: 'MAKEDATETIME', category: 'date', signature: 'MAKEDATETIME(date, time)',                     minArgs: 2, maxArgs: 2, returnType: 'datetime', docstring: 'Construct datetime.' },
  { name: 'MAKETIME',     category: 'date', signature: 'MAKETIME(hour, minute, second)',               minArgs: 3, maxArgs: 3, returnType: 'datetime', docstring: 'Construct time.' },
  { name: 'NOW',          category: 'date', signature: 'NOW()',                                        minArgs: 0, maxArgs: 0, returnType: 'datetime', docstring: 'Current timestamp.' },
  { name: 'TODAY',        category: 'date', signature: 'TODAY()',                                      minArgs: 0, maxArgs: 0, returnType: 'date',     docstring: 'Current date.' },
  { name: 'YEAR',         category: 'date', signature: 'YEAR(date)',                                   minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Year component.' },
  { name: 'QUARTER',      category: 'date', signature: 'QUARTER(date)',                                minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Quarter component (1-4).' },
  { name: 'MONTH',        category: 'date', signature: 'MONTH(date)',                                  minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Month component (1-12).' },
  { name: 'WEEK',         category: 'date', signature: 'WEEK(date)',                                   minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Week of year.' },
  { name: 'DAY',          category: 'date', signature: 'DAY(date)',                                    minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Day of month.' },
  { name: 'HOUR',         category: 'date', signature: 'HOUR(datetime)',                               minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Hour component.' },
  { name: 'MINUTE',       category: 'date', signature: 'MINUTE(datetime)',                             minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Minute component.' },
  { name: 'SECOND',       category: 'date', signature: 'SECOND(datetime)',                             minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Second component.' },
  { name: 'WEEKDAY',      category: 'date', signature: 'WEEKDAY(date)',                                minArgs: 1, maxArgs: 1, returnType: 'number',   docstring: 'Day of week (0-6).' },

  // User
  { name: 'USERNAME',   category: 'user', signature: 'USERNAME()',           minArgs: 0, maxArgs: 0, returnType: 'string',  docstring: 'Current username.' },
  { name: 'FULLNAME',   category: 'user', signature: 'FULLNAME()',           minArgs: 0, maxArgs: 0, returnType: 'string',  docstring: 'Current user full name.' },
  { name: 'USERDOMAIN', category: 'user', signature: 'USERDOMAIN()',         minArgs: 0, maxArgs: 0, returnType: 'string',  docstring: 'Current user domain.' },
  { name: 'USER',       category: 'user', signature: 'USER()',               minArgs: 0, maxArgs: 0, returnType: 'string',  docstring: 'Tableau alias for USERNAME().' },
  { name: 'ISFULLNAME', category: 'user', signature: 'ISFULLNAME(name)',     minArgs: 1, maxArgs: 1, returnType: 'boolean', docstring: 'Full-name match.' },
  { name: 'ISUSERNAME', category: 'user', signature: 'ISUSERNAME(name)',     minArgs: 1, maxArgs: 1, returnType: 'boolean', docstring: 'Username match.' },
  { name: 'ISMEMBEROF', category: 'user', signature: 'ISMEMBEROF(group)',    minArgs: 1, maxArgs: 1, returnType: 'boolean', docstring: 'Group membership check.' },

  // Spatial
  { name: 'MAKEPOINT',  category: 'spatial', signature: 'MAKEPOINT(lat, lon)',         minArgs: 2, maxArgs: 2, returnType: 'spatial', docstring: 'Construct a point.' },
  { name: 'MAKELINE',   category: 'spatial', signature: 'MAKELINE(geom1, geom2)',      minArgs: 2, maxArgs: 2, returnType: 'spatial', docstring: 'Construct a line.' },
  { name: 'DISTANCE',   category: 'spatial', signature: 'DISTANCE(geom1, geom2, unit)', minArgs: 3, maxArgs: 3, returnType: 'number',  docstring: 'Spatial distance.' },
  { name: 'BUFFER',     category: 'spatial', signature: 'BUFFER(geom, dist, unit)',    minArgs: 3, maxArgs: 3, returnType: 'spatial', docstring: 'Spatial buffer.' },
  { name: 'AREA',       category: 'spatial', signature: 'AREA(geom, unit)',            minArgs: 2, maxArgs: 2, returnType: 'number',  docstring: 'Spatial area.' },
  { name: 'INTERSECTS', category: 'spatial', signature: 'INTERSECTS(geom1, geom2)',    minArgs: 2, maxArgs: 2, returnType: 'boolean', docstring: 'Intersection test.' },
  { name: 'OVERLAPS',   category: 'spatial', signature: 'OVERLAPS(geom1, geom2)',      minArgs: 2, maxArgs: 2, returnType: 'boolean', docstring: 'Overlap test.' },
  { name: 'DIFFERENCE', category: 'spatial', signature: 'DIFFERENCE(geom1, geom2)',    minArgs: 2, maxArgs: 2, returnType: 'spatial', docstring: 'Spatial difference.' },
  { name: 'UNION',      category: 'spatial', signature: 'UNION(geom1, geom2)',         minArgs: 2, maxArgs: 2, returnType: 'spatial', docstring: 'Spatial union.' },

  // Passthrough (RAWSQL_*) — feature-flagged
  { name: 'RAWSQL_BOOL',     category: 'passthrough', signature: 'RAWSQL_BOOL(template, args...)',     minArgs: 1, maxArgs: -1, returnType: 'boolean',  docstring: 'Raw SQL returning boolean — feature-flagged.' },
  { name: 'RAWSQL_INT',      category: 'passthrough', signature: 'RAWSQL_INT(template, args...)',      minArgs: 1, maxArgs: -1, returnType: 'number',   docstring: 'Raw SQL returning integer — feature-flagged.' },
  { name: 'RAWSQL_REAL',     category: 'passthrough', signature: 'RAWSQL_REAL(template, args...)',     minArgs: 1, maxArgs: -1, returnType: 'number',   docstring: 'Raw SQL returning real — feature-flagged.' },
  { name: 'RAWSQL_STR',      category: 'passthrough', signature: 'RAWSQL_STR(template, args...)',      minArgs: 1, maxArgs: -1, returnType: 'string',   docstring: 'Raw SQL returning string — feature-flagged.' },
  { name: 'RAWSQL_DATE',     category: 'passthrough', signature: 'RAWSQL_DATE(template, args...)',     minArgs: 1, maxArgs: -1, returnType: 'date',     docstring: 'Raw SQL returning date — feature-flagged.' },
  { name: 'RAWSQL_DATETIME', category: 'passthrough', signature: 'RAWSQL_DATETIME(template, args...)', minArgs: 1, maxArgs: -1, returnType: 'datetime', docstring: 'Raw SQL returning datetime — feature-flagged.' },

  // Table calc (names only — argless; actual addressing via Compute Using dialog)
  ...['RUNNING_SUM','RUNNING_AVG','RUNNING_MIN','RUNNING_MAX','RUNNING_COUNT',
      'WINDOW_SUM','WINDOW_AVG','WINDOW_MIN','WINDOW_MAX','WINDOW_MEDIAN',
      'WINDOW_STDEV','WINDOW_VAR','WINDOW_PERCENTILE','WINDOW_CORR','WINDOW_COVAR',
      'INDEX','FIRST','LAST','SIZE','LOOKUP','PREVIOUS_VALUE',
      'RANK','RANK_DENSE','RANK_MODIFIED','RANK_UNIQUE','RANK_PERCENTILE',
      'TOTAL','PCT_TOTAL','DIFF','IS_DISTINCT','IS_STACKED'].map<CalcFunctionDef>((name) => ({
    name, category: 'table_calc',
    signature: `${name}(expression)`,
    minArgs: 0, maxArgs: -1, returnType: 'number',
    docstring: `${name} table calculation — addressing configured via Compute Using.`,
  })),
]);

export const CALC_KEYWORDS = ['IF','THEN','ELSE','ELSEIF','END','CASE','WHEN','AND','OR','NOT','IN','TRUE','FALSE','NULL'] as const;
export const CALC_LOD_KEYWORDS = ['FIXED','INCLUDE','EXCLUDE'] as const;

export function functionByName(name: string): CalcFunctionDef | undefined {
  return CALC_FUNCTIONS.find((f) => f.name === name.toUpperCase());
}
export function functionNames(): readonly string[] {
  return CALC_FUNCTIONS.map((f) => f.name);
}
