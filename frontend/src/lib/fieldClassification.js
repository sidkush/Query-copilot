/**
 * Field classification utilities for auto-detecting whether database columns
 * are dimensions or measures in a BI dashboard context.
 */

/**
 * Maps SQL aggregation function names to their preferred field type.
 * "measure" functions operate on numeric values (SUM, AVG, etc.).
 * "dimension" functions count or describe categorical data (COUNT, MEDIAN, etc.).
 */
export const MEASURE_FUNCTIONS = {
  SUM: 'measure',
  AVG: 'measure',
  MAX: 'measure',
  MIN: 'measure',
  STDDEV: 'measure',
  VAR: 'measure',
  VARIANCE: 'measure',
  STDEV: 'measure',
  COUNT: 'dimension',
  COUNTD: 'dimension',
  'COUNT(DISTINCT)': 'dimension',
  MEDIAN: 'dimension',
  MODE: 'dimension',
};

/**
 * Sample up to the first `limit` non-null values of a column from row data.
 */
function sampleValues(rows, colName, limit = 20) {
  const samples = [];
  for (let i = 0; i < rows.length && samples.length < limit; i++) {
    const v = rows[i][colName];
    if (v !== null && v !== undefined) {
      samples.push(v);
    }
  }
  return samples;
}

/**
 * Check whether a value is numeric (not null, not empty, not boolean).
 */
function isNumericValue(v) {
  return !isNaN(Number(v)) && v !== null && v !== '' && typeof v !== 'boolean';
}

/**
 * SQL type keywords that indicate a numeric/measure column.
 */
const NUMERIC_TYPE_PATTERNS = /^(int|integer|bigint|smallint|tinyint|float|double|decimal|numeric|real|number|money|serial)/i;

/**
 * Auto-detect dimension/measure classification for each column based on data.
 *
 * @param {string[]|Object[]} columns - Array of column name strings, OR objects with {name, type}.
 * @param {Object[]} rows - Array of row objects.
 * @param {Object} existingClassifications - User overrides: { colName: "dimension"|"measure" }.
 * @returns {Object} Classification map: { colName: "dimension"|"measure" } for every column.
 */
export function classifyColumns(columns, rows, existingClassifications = {}) {
  const result = {};

  for (const entry of columns) {
    const col = typeof entry === 'string' ? entry : (entry.name || '');
    const schemaType = typeof entry === 'object' ? (entry.type || entry.data_type || '') : '';

    if (!col) continue;

    // Honour user overrides first
    if (existingClassifications[col]) {
      result[col] = existingClassifications[col];
      continue;
    }

    const samples = sampleValues(rows, col);

    if (samples.length > 0) {
      // Classify from actual data
      const numericCount = samples.filter(isNumericValue).length;
      const ratio = numericCount / samples.length;
      result[col] = ratio > 0.8 ? 'measure' : 'dimension';
    } else if (schemaType && NUMERIC_TYPE_PATTERNS.test(schemaType.trim())) {
      // No rows but schema type is numeric → measure
      result[col] = 'measure';
    } else {
      // Default to dimension
      result[col] = 'dimension';
    }
  }

  return result;
}

/**
 * Heuristic date detection for a column.
 *
 * Samples the first 20 non-null values and checks whether >80% parse as dates.
 * Pure numeric values (bare integers) are rejected to avoid false positives
 * from numeric IDs like 20240101.
 *
 * @param {string} colName - Column name to test.
 * @param {Object[]} rows - Array of row objects.
 * @returns {boolean} True if the column likely contains date values.
 */
export function isDateColumn(colName, rows) {
  const samples = sampleValues(rows, colName);

  if (samples.length === 0) {
    return false;
  }

  let dateCount = 0;

  for (const v of samples) {
    const str = String(v);

    // Reject pure numbers — timestamps as bare integers would false-positive
    // (e.g. numeric IDs like 20240101 or Unix timestamps)
    if (/^\d+(\.\d+)?$/.test(str.trim())) {
      continue;
    }

    if (!isNaN(Date.parse(str))) {
      dateCount++;
    }
  }

  const ratio = dateCount / samples.length;
  return ratio > 0.8;
}

/**
 * Detect a latitude column by name + value range. Phase 4.4 / DeckGlobe.
 * Name patterns: lat, latitude, y_coord, lat_deg. Values must be -90..90.
 */
export function isLatColumn(colName, rows) {
  if (!colName) return false;
  const nameMatch = /^(lat|latitude|y_coord|lat_deg)$/i.test(colName);
  if (!nameMatch) return false;
  const sample = sampleValues(rows, colName)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  return sample.length > 0 && sample.every((v) => v >= -90 && v <= 90);
}

/**
 * Detect a longitude column by name + value range. Phase 4.4 / DeckGlobe.
 * Name patterns: lng, lon, long, longitude, x_coord, lon_deg. Values -180..180.
 */
export function isLngColumn(colName, rows) {
  if (!colName) return false;
  const nameMatch = /^(lng|lon|long|longitude|x_coord|lon_deg)$/i.test(colName);
  if (!nameMatch) return false;
  const sample = sampleValues(rows, colName)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  return sample.length > 0 && sample.every((v) => v >= -180 && v <= 180);
}

/**
 * Returns { latCol, lngCol } if the row set contains a valid coordinate
 * pair, or null otherwise. Used by chartDefs analysis + DeckGlobe to
 * decide whether to surface the globe chart type.
 */
export function isCoordinatePair(columns, rows) {
  if (!Array.isArray(columns)) return null;
  const latCol = columns.find((c) => isLatColumn(c, rows));
  const lngCol = columns.find((c) => isLngColumn(c, rows));
  return latCol && lngCol ? { latCol, lngCol } : null;
}

/**
 * Return field suggestions based on the enclosing SQL aggregation function.
 *
 * @param {string|null} functionName - SQL function name (e.g. "SUM"), or null.
 * @param {Object} classifications - Classification map from classifyColumns.
 * @returns {{ dimensions: string[], measures: string[], preferred: string }}
 */
export function getFieldSuggestions(functionName, classifications) {
  const dimensions = [];
  const measures = [];

  for (const [col, type] of Object.entries(classifications)) {
    if (type === 'measure') {
      measures.push(col);
    } else {
      dimensions.push(col);
    }
  }

  const key = functionName?.toUpperCase();
  const mapped = key != null ? MEASURE_FUNCTIONS[key] : undefined;

  let preferred;
  if (mapped === 'measure') {
    preferred = 'measure';
  } else if (mapped === 'dimension') {
    preferred = 'dimension';
  } else {
    preferred = 'all';
  }

  return { dimensions, measures, preferred };
}
