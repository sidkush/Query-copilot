/**
 * Show Me chart recommender — Mackinlay-Hanrahan-Stolte rules.
 *
 * Implementation reference:
 *   Mackinlay, Hanrahan, Stolte (2007), "Show Me: Automatic Presentation
 *   for Visual Analysis," IEEE TVCG 13(6).
 *
 * Spec section: docs/chart_systems_research.md §2.2
 *
 * Algorithm:
 *  1. For each chart type in the registry, check if its requirements are
 *     met by the result shape (expressiveness gate).
 *  2. If yes, score it by Mackinlay's effectiveness ranking (best visual
 *     channel for the data type wins).
 *  3. Return ranked list. Top result is the default for auto-pick mode.
 *  4. availableChartTypes() returns the full catalog with disabled flags
 *     and human-readable explanations of why a chart is unavailable.
 */
import type { Mark, ChartSpec } from '../types';
import type { ResultShape } from './resultShape';
import { CHART_TYPES, type ChartTypeDef } from './chartTypes';
import { globalUserChartTypeRegistry } from '../userTypes/registry';

export interface ChartRecommendation {
  mark: Mark;
  id: string;
  label: string;
  score: number;
  reason: string;
  specDraft: ChartSpec;
  disabled: false;
}

export interface ChartAvailability {
  mark: Mark;
  id: string;
  label: string;
  available: boolean;
  missing?: string;
}

/** Check if a chart type's requirements are met by a result shape. */
function meetsRequirements(def: ChartTypeDef, shape: ResultShape): { ok: boolean; missing?: string } {
  const r = def.requires;

  if (r.requiresGeo && !shape.hasGeo) {
    return { ok: false, missing: 'Requires a geographic dimension' };
  }
  if (r.requiresTemporal && !shape.hasDate) {
    return { ok: false, missing: 'Requires a temporal (date/time) dimension' };
  }
  if (r.minDims !== undefined && shape.nDimensions < r.minDims) {
    return { ok: false, missing: `Requires at least ${r.minDims} dimension(s)` };
  }
  if (r.minMeasures !== undefined && shape.nMeasures < r.minMeasures) {
    return { ok: false, missing: `Requires at least ${r.minMeasures} measure(s)` };
  }
  if (r.maxRows !== undefined && shape.rowCount > r.maxRows) {
    return { ok: false, missing: `Best with ≤${r.maxRows} rows (have ${shape.rowCount})` };
  }
  return { ok: true };
}

/**
 * Mackinlay effectiveness scoring.
 *
 * Scores are 0-100. Higher is better. Rules from the 2007 paper:
 *  - Position is the most effective channel for all data types
 *  - Temporal data on x-axis with line mark is highest signal
 *  - Geographic data on a map is dominant when applicable
 *  - High-cardinality nominal data prefers bars over pie/treemap
 *  - 2-measure scatter is dominant when no dims are present
 */
function scoreChart(def: ChartTypeDef, shape: ResultShape): number {
  // Map dominates when applicable.
  if (shape.hasGeo && def.id === 'map') return 95;

  // Temporal + measure → line wins.
  if (shape.hasDate && shape.nMeasures >= 1) {
    if (def.id === 'line') return 90;
    if (def.id === 'area') return 70;
    if (def.id === 'bar') return 50;
  }

  // 2 measures + 0 dims → scatter dominates.
  if (shape.nDimensions === 0 && shape.nMeasures >= 2) {
    if (def.id === 'scatter') return 90;
  }

  // 1 nominal dim + 1 measure → bar wins, pie acceptable for low cardinality.
  if (shape.nDimensions === 1 && shape.nMeasures >= 1 && !shape.hasDate && !shape.hasGeo) {
    if (def.id === 'bar') return 85;
    if (def.id === 'pie' && shape.maxDimensionCardinality <= 8) return 60;
  }

  // High-cardinality dimensions: bar (sorted top-N) over treemap.
  if (shape.hasHighCardinalityDim && def.id === 'bar') return 70;

  // Default: 50 if requirements met, 0 otherwise.
  return 50;
}

/**
 * Recommend chart types ranked by score for a given result shape.
 * Returns only chart types whose requirements are met.
 */
export function recommendCharts(shape: ResultShape): ChartRecommendation[] {
  const recs: ChartRecommendation[] = [];

  for (const def of CHART_TYPES) {
    const fit = meetsRequirements(def, shape);
    if (!fit.ok) continue;

    const score = scoreChart(def, shape);
    if (score === 0) continue;

    recs.push({
      mark: def.mark,
      id: def.id,
      label: def.label,
      score,
      reason: def.description,
      specDraft: def.autoAssign(shape),
      disabled: false,
    });
  }

  // Score user-authored chart types from the global registry.
  for (const userType of globalUserChartTypeRegistry.list()) {
    const fieldParams = userType.parameters.filter((p) => p.kind === 'field');
    const allMatch = fieldParams.every((param) => {
      const st = param.semanticType;
      if (st === 'nominal') {
        return shape.columns.some(
          (c) => c.role === 'dimension' && c.semanticType === 'nominal',
        );
      }
      if (st === 'ordinal') {
        return shape.columns.some(
          (c) => c.role === 'dimension' && c.semanticType === 'ordinal',
        );
      }
      if (st === 'quantitative') {
        return shape.nMeasures >= 1;
      }
      if (st === 'temporal') {
        return shape.hasDate;
      }
      if (st === 'geographic') {
        return shape.hasGeo;
      }
      // Field params without a semanticType constraint always match.
      return true;
    });

    if (!allMatch) continue;

    recs.push({
      mark: (userType.specTemplate.mark as Mark) || 'bar',
      id: userType.id,
      label: userType.name,
      score: 50,
      reason: `Custom type: ${userType.name}`,
      specDraft: userType.specTemplate,
      disabled: false,
    });
  }

  return recs.sort((a, b) => b.score - a.score);
}

/**
 * Return the full chart catalog with availability flags.
 * Used by the Show Me picker UI to show greyed-out options with
 * explanations of what the data is missing.
 */
export function availableChartTypes(shape: ResultShape): ChartAvailability[] {
  return CHART_TYPES.map((def) => {
    const fit = meetsRequirements(def, shape);
    return {
      mark: def.mark,
      id: def.id,
      label: def.label,
      available: fit.ok,
      missing: fit.missing,
    };
  });
}
