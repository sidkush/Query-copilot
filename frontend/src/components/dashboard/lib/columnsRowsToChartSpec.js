import {
  analyzeResultShape,
  recommendCharts,
} from "../../../chart-ir";

/**
 * columnsRowsToChartSpec — Phase 4c+3 migration helper.
 *
 * Accepts a raw {columns, rows} query result (the legacy shape shipped
 * by `POST /api/queries/execute`) and returns a ChartSpec + ColumnProfile[]
 * tuple you can pass straight into DashboardTileCanvas:
 *
 *   const { spec, columnProfile } = columnsRowsToChartSpec(columns, rows);
 *   <DashboardTileCanvas tile={{id, title, chart_spec: spec}}
 *                        resultSetOverride={{columns, rows, columnProfile}} />
 *
 * Steps:
 *   1. Sniff each column's dtype + semantic type from the first
 *      non-null sample row. Inference is conservative — when in doubt
 *      we call it nominal (a bar-chart default that always renders).
 *   2. Split columns into dimensions + measures by dtype. Numeric
 *      columns default to measures; everything else defaults to
 *      dimension.
 *   3. Feed the resulting ColumnProfile[] into analyzeResultShape +
 *      recommendCharts and take the top recommendation's specDraft.
 *   4. If the recommender returns nothing (no eligible charts), fall
 *      back to a plain bar chart over the first dimension + first
 *      measure.
 *
 * Pure function, no React, no side effects. Handles the row-of-objects
 * and row-of-arrays shapes the backend emits.
 */

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function valueAt(row, columnName, columnIndex) {
  if (row == null) return null;
  if (Array.isArray(row)) return row[columnIndex];
  if (typeof row === "object") return row[columnName];
  return null;
}

function firstNonNullSample(rows, columnName, columnIndex, limit = 10) {
  const samples = [];
  for (let i = 0; i < rows.length && samples.length < limit; i += 1) {
    const v = valueAt(rows[i], columnName, columnIndex);
    if (v !== null && v !== undefined && v !== "") samples.push(v);
  }
  return samples;
}

function sniffDtypeAndSemantic(samples) {
  if (samples.length === 0) {
    return { dtype: "string", semanticType: "nominal" };
  }
  let numericCount = 0;
  let intCount = 0;
  let dateCount = 0;
  let boolCount = 0;
  for (const v of samples) {
    if (typeof v === "number") {
      numericCount += 1;
      if (Number.isInteger(v)) intCount += 1;
      continue;
    }
    if (typeof v === "boolean") {
      boolCount += 1;
      continue;
    }
    if (typeof v === "string") {
      if (DATE_LIKE.test(v) || ISO_TIMESTAMP.test(v)) {
        dateCount += 1;
        continue;
      }
      // String numerics still count as quantitative.
      const asNum = Number(v);
      if (!Number.isNaN(asNum) && v.trim() !== "") {
        numericCount += 1;
        if (Number.isInteger(asNum)) intCount += 1;
      }
      continue;
    }
    if (v instanceof Date) {
      dateCount += 1;
    }
  }
  if (dateCount > samples.length / 2) {
    return { dtype: "date", semanticType: "temporal" };
  }
  if (boolCount === samples.length) {
    return { dtype: "bool", semanticType: "nominal" };
  }
  if (numericCount === samples.length) {
    return {
      dtype: intCount === samples.length ? "int" : "float",
      semanticType: "quantitative",
    };
  }
  return { dtype: "string", semanticType: "nominal" };
}

function buildColumnProfile(columns, rows) {
  const colArray = Array.isArray(columns) ? columns : [];
  const rowArray = Array.isArray(rows) ? rows : [];
  return colArray.map((name, idx) => {
    const samples = firstNonNullSample(rowArray, name, idx);
    const { dtype, semanticType } = sniffDtypeAndSemantic(samples);
    const role =
      semanticType === "quantitative" && dtype !== "date"
        ? "measure"
        : "dimension";
    // Cardinality approximation from the sampled set (fast + good enough
    // for the recommender). Full distinct count would require scanning
    // every row; the recommender only needs order-of-magnitude.
    const sampleSet = new Set(samples.map((v) => String(v)));
    return {
      name,
      dtype,
      role,
      semanticType,
      cardinality: sampleSet.size,
      nullPct: 0,
      sampleValues: samples.slice(0, 5),
    };
  });
}

/**
 * Convert raw {columns, rows} into a ChartSpec + ColumnProfile.
 *
 * @param {string[]} columns column names
 * @param {Array<object|Array>} rows result rows
 * @returns {{ spec: ChartSpec | null, columnProfile: ColumnProfile[] }}
 */
export function columnsRowsToChartSpec(columns, rows) {
  const columnProfile = buildColumnProfile(columns, rows);
  const rowCount = Array.isArray(rows) ? rows.length : 0;

  if (columnProfile.length === 0) {
    return { spec: null, columnProfile };
  }

  const shape = analyzeResultShape({ columns: columnProfile, rowCount });
  let spec = null;

  try {
    const recs = recommendCharts(shape);
    if (Array.isArray(recs) && recs.length > 0) {
      spec = recs[0].specDraft;
    }
  } catch {
    spec = null;
  }

  if (!spec) {
    // Conservative fallback: a bar chart over the first dimension /
    // first measure. If there are no measures, count rows by the first
    // dimension.
    const firstDim = columnProfile.find((c) => c.role === "dimension");
    const firstMeasure = columnProfile.find((c) => c.role === "measure");
    if (firstDim && firstMeasure) {
      spec = {
        $schema: "askdb/chart-spec/v1",
        type: "cartesian",
        mark: "bar",
        encoding: {
          x: { field: firstDim.name, type: firstDim.semanticType },
          y: {
            field: firstMeasure.name,
            type: "quantitative",
            aggregate: "sum",
          },
        },
      };
    } else if (firstDim) {
      spec = {
        $schema: "askdb/chart-spec/v1",
        type: "cartesian",
        mark: "bar",
        encoding: {
          x: { field: firstDim.name, type: firstDim.semanticType },
          y: { aggregate: "count", field: "*", type: "quantitative" },
        },
      };
    }
  }

  return { spec, columnProfile };
}
