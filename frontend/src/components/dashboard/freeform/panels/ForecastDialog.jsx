import React, { useMemo, useState } from 'react';
import { useStore } from '../../../../store';
import { fetchForecast } from '../../../../api';
import ForecastStatsBadge from './ForecastStatsBadge';

// Stable empty fallback so the marks-card-dims selector returns a
// referentially-equal array when the store slice is undefined; otherwise
// React 19's `useSyncExternalStore` flags the new-on-every-render array
// literal and aborts with "getSnapshot should be cached".
const EMPTY_DIMS = Object.freeze([]);

/**
 * Plan 9c T9 — Forecast editor dialog.
 *
 * Mirrors TrendLineDialog shape. Posts row data + spec to
 * /api/v1/analytics/forecast, previews best-model stats per factor,
 * saves into analystProForecasts on Save.
 */
const FORECAST_UNITS = [
  'auto', 'years', 'quarters', 'months', 'weeks',
  'days', 'hours', 'minutes', 'seconds',
];
const MODELS = [
  { value: 'auto', label: 'Auto (8 models, best by information criterion)' },
  { value: 'additive', label: 'Additive' },
  { value: 'multiplicative', label: 'Multiplicative' },
  { value: 'custom', label: 'Custom' },
];
const CONFIDENCE_LEVELS = [0.9, 0.95, 0.99];

export default function ForecastDialog() {
  const ctx = useStore((s) => s.analystProForecastDialogCtx);
  const close = useStore((s) => s.closeForecastDialogAnalystPro);
  const addForecast = useStore((s) => s.addForecastAnalystPro);
  const availableDims = useStore((s) => s.analystProCurrentMarksCardDims ?? EMPTY_DIMS);

  const [forecastLength, setForecastLength] = useState(ctx?.preset?.forecast_length ?? 12);
  const [forecastUnit, setForecastUnit] = useState(ctx?.preset?.forecast_unit ?? 'auto');
  const [model, setModel] = useState(ctx?.preset?.model ?? 'auto');
  const [seasonLength, setSeasonLength] = useState(ctx?.preset?.season_length ?? 12);
  const [confidenceLevel, setConfidenceLevel] = useState(0.95);
  const [ignoreLast, setIgnoreLast] = useState(0);
  const [factorFields, setFactorFields] = useState([]);
  const [previewFits, setPreviewFits] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loading, setLoading] = useState(false);

  const spec = useMemo(
    () => ({
      forecast_length: forecastLength,
      forecast_unit: forecastUnit,
      model,
      season_length: model === 'auto' ? null : seasonLength,
      confidence_level: confidenceLevel,
      ignore_last: ignoreLast,
    }),
    [forecastLength, forecastUnit, model, seasonLength, confidenceLevel, ignoreLast],
  );

  async function handlePreview() {
    setLoading(true);
    setPreviewError(null);
    try {
      const series = ctx?.rows ?? [];
      const { fits } = await fetchForecast({ series, spec, factor_fields: factorFields });
      setPreviewFits(fits);
    } catch (e) {
      setPreviewError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    if (!ctx) return;
    addForecast({
      id: `forecast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tileId: ctx.tileId,
      spec,
      fits: previewFits ?? [],
    });
    close();
  }

  if (!ctx) return null;

  return (
    <div role="dialog" aria-label="Forecast editor" className="forecast-dialog">
      <header><h3>Forecast</h3></header>

      <label>
        Forecast length
        <input
          type="number" min={1} max={200}
          value={forecastLength}
          onChange={(e) => setForecastLength(Number(e.target.value))}
        />
        <select value={forecastUnit} onChange={(e) => setForecastUnit(e.target.value)}>
          {FORECAST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>

      <label>
        Model
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>

      {model !== 'auto' && (
        <label>
          Season length
          <input
            type="number" min={2} value={seasonLength}
            onChange={(e) => setSeasonLength(Number(e.target.value))}
          />
        </label>
      )}

      <fieldset>
        <legend>Confidence level</legend>
        {CONFIDENCE_LEVELS.map((lvl) => (
          <label key={lvl}>
            <input
              type="radio" name="confidence-level" value={lvl}
              checked={confidenceLevel === lvl}
              onChange={() => setConfidenceLevel(lvl)}
            />
            {Math.round(lvl * 100)}%
          </label>
        ))}
      </fieldset>

      <label>
        Ignore last N periods
        <input
          type="number" min={0} value={ignoreLast}
          onChange={(e) => setIgnoreLast(Number(e.target.value))}
        />
      </label>

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
            />
            {d}
          </label>
        ))}
      </fieldset>

      <div className="actions">
        <button type="button" onClick={handlePreview} disabled={loading}>
          {loading ? 'Fitting…' : 'Preview'}
        </button>
        <button type="button" onClick={handleSave} disabled={!previewFits}>Save</button>
        <button type="button" onClick={close}>Cancel</button>
      </div>

      {previewError && <p className="error">{previewError}</p>}

      {previewFits && (
        <ul className="preview">
          {previewFits.map((f, i) => (
            <li key={i}>
              <strong>{String(f.factor_value ?? 'all')}</strong>
              <ForecastStatsBadge fit={f.result} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
