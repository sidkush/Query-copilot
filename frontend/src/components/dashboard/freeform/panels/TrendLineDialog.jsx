import React, { useMemo, useState } from 'react';
import { useStore } from '../../../../store';
import { fetchTrendFit } from '../../../../api';

/**
 * Plan 9b T7 — Trend-line editor dialog.
 *
 * Opened from the Analytics sidebar catalogue via `openTrendLineDialogAnalystPro`.
 * Posts row data + spec to `/api/v1/analytics/trend-fit`, previews the
 * returned `fits[]` in a small stats table, then persists via the flat
 * store-level `analystProTrendLines` array on Save.
 */
const FIT_TYPES = [
  { value: 'linear', label: 'Linear' },
  { value: 'logarithmic', label: 'Logarithmic' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'power', label: 'Power' },
  { value: 'polynomial', label: 'Polynomial' },
];

const CONFIDENCE_LEVELS = [0.9, 0.95, 0.99];

export default function TrendLineDialog() {
  const ctx = useStore((s) => s.analystProTrendLineDialogCtx);
  const close = useStore((s) => s.closeTrendLineDialogAnalystPro);
  const addTrendLine = useStore((s) => s.addTrendLineAnalystPro);
  const availableDims = useStore((s) => s.analystProCurrentMarksCardDims ?? []);

  const [fitType, setFitType] = useState(ctx?.preset?.fit_type ?? 'linear');
  const [degree, setDegree] = useState(ctx?.preset?.degree ?? 2);
  const [factorFields, setFactorFields] = useState([]);
  const [showBands, setShowBands] = useState(false);
  const [confidenceLevel, setConfidenceLevel] = useState(0.95);
  const [colorByFactor, setColorByFactor] = useState(false);
  const [trendLabel, setTrendLabel] = useState(true);
  const [previewFits, setPreviewFits] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loading, setLoading] = useState(false);

  const spec = useMemo(
    () => ({
      fit_type: fitType,
      degree: fitType === 'polynomial' ? degree : null,
      factor_fields: factorFields,
      show_confidence_bands: showBands,
      confidence_level: confidenceLevel,
      color_by_factor: colorByFactor,
      trend_line_label: trendLabel,
    }),
    [fitType, degree, factorFields, showBands, confidenceLevel, colorByFactor, trendLabel],
  );

  async function handlePreview() {
    setLoading(true);
    setPreviewError(null);
    try {
      const rows = ctx?.rows ?? [];
      const { fits } = await fetchTrendFit({ rows, spec });
      setPreviewFits(fits);
    } catch (e) {
      setPreviewError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    if (!ctx) return;
    addTrendLine({
      id: `trend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tileId: ctx.tileId,
      spec,
      fits: previewFits ?? [],
    });
    close();
  }

  if (!ctx) return null;

  return (
    <div role="dialog" aria-label="Trend line editor" className="trend-line-dialog">
      <header>
        <h3>Trend Line</h3>
      </header>

      <label>
        Fit type
        <select value={fitType} onChange={(e) => setFitType(e.target.value)}>
          {FIT_TYPES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      {fitType === 'polynomial' && (
        <label>
          Degree
          <input
            type="range"
            min={2}
            max={8}
            value={degree}
            onChange={(e) => setDegree(Number(e.target.value))}
          />
          <span>{degree}</span>
        </label>
      )}

      <fieldset>
        <legend>Factors</legend>
        {availableDims.map((d) => (
          <label key={d}>
            <input
              type="checkbox"
              checked={factorFields.includes(d)}
              onChange={(e) =>
                setFactorFields((prev) =>
                  e.target.checked ? [...prev, d] : prev.filter((f) => f !== d),
                )
              }
            />{' '}
            {d}
          </label>
        ))}
      </fieldset>

      <label>
        <input
          type="checkbox"
          checked={showBands}
          onChange={(e) => setShowBands(e.target.checked)}
        />
        Confidence bands
      </label>

      {showBands && (
        <label>
          Level
          <select
            value={confidenceLevel}
            onChange={(e) => setConfidenceLevel(Number(e.target.value))}
          >
            {CONFIDENCE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {(l * 100).toFixed(0)}%
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        <input
          type="checkbox"
          checked={colorByFactor}
          onChange={(e) => setColorByFactor(e.target.checked)}
        />
        Color by factor
      </label>

      <label>
        <input
          type="checkbox"
          checked={trendLabel}
          onChange={(e) => setTrendLabel(e.target.checked)}
        />
        Show trend line label
      </label>

      <button type="button" onClick={handlePreview} disabled={loading}>
        {loading ? 'Fitting…' : 'Preview'}
      </button>

      {previewError && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {previewError}
        </p>
      )}

      {previewFits && (
        <table className="trend-preview-stats">
          <thead>
            <tr>
              <th>Factor</th>
              <th>R²</th>
              <th>p-value</th>
              <th>N</th>
            </tr>
          </thead>
          <tbody>
            {previewFits.map((f, i) => (
              <tr key={i}>
                <td>{f.factor_value == null ? '(all)' : String(f.factor_value)}</td>
                <td>{f.result.r_squared.toFixed(2)}</td>
                <td>{f.result.p_value.toExponential(2)}</td>
                <td>{f.result.predictions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer>
        <button type="button" onClick={close}>
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={!previewFits}>
          Save
        </button>
      </footer>
    </div>
  );
}
