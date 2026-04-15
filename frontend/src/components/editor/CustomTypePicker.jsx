import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api";
import {
  globalUserChartTypeRegistry,
  InstantiationError,
} from "../../chart-ir";

/**
 * CustomTypePicker — Sub-project C UI hook.
 *
 * Lists user-authored chart types from the global UserChartTypeRegistry
 * and lets the user instantiate one into the active spec. Hydrates from
 * the backend via `api.listChartTypes()` on mount.
 *
 * Click a type → opens an inline param form sized to the type's
 * `parameters[]`. Submit → calls `globalUserChartTypeRegistry.instantiate()`
 * and dispatches the instantiated ChartSpec via `onSpecChange`.
 *
 * Field-kind params render as text inputs by default. If `columnProfile`
 * is supplied (from the active result set), field params upgrade to
 * dropdowns of known column names.
 *
 * Errors surface inline (validation errors from instantiate() → red
 * border + message) so the picker stays self-contained.
 */
const AGGREGATE_OPTIONS = [
  "sum",
  "avg",
  "min",
  "max",
  "count",
  "distinct",
  "median",
  "stdev",
  "variance",
  "p25",
  "p75",
  "p95",
  "none",
];

export default function CustomTypePicker({ onSpecChange, columnProfile = [] }) {
  const [types, setTypes] = useState(() => globalUserChartTypeRegistry.list());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [selectedTypeId, setSelectedTypeId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await api.listChartTypes();
        const fetched = resp?.chart_types || [];
        globalUserChartTypeRegistry.clear();
        globalUserChartTypeRegistry.hydrate(fetched);
        if (!cancelled) {
          setTypes(globalUserChartTypeRegistry.list());
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const out = {};
    for (const t of types) {
      const cat = t.category || "Custom";
      if (!out[cat]) out[cat] = [];
      out[cat].push(t);
    }
    return out;
  }, [types]);

  const selectedType = selectedTypeId
    ? types.find((t) => t.id === selectedTypeId) || null
    : null;

  const handleClose = useCallback(() => setSelectedTypeId(null), []);

  const handleInstantiate = useCallback(
    (typeId, params) => {
      try {
        const spec = globalUserChartTypeRegistry.instantiate(typeId, params);
        if (onSpecChange) onSpecChange(spec);
        setSelectedTypeId(null);
        return { ok: true };
      } catch (err) {
        const msg =
          err instanceof InstantiationError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        return { ok: false, error: msg };
      }
    },
    [onSpecChange],
  );

  return (
    <div
      data-testid="custom-type-picker"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted, rgba(255,255,255,0.45))",
          fontWeight: 700,
          padding: "6px 2px",
          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
          marginBottom: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Custom types</span>
        {loading && (
          <span
            data-testid="custom-type-picker-loading"
            style={{ fontSize: 9, color: "var(--text-muted, rgba(255,255,255,0.35))" }}
          >
            loading…
          </span>
        )}
      </div>

      {loadError && (
        <div
          data-testid="custom-type-picker-error"
          style={{
            fontSize: 10,
            color: "#f87171",
            padding: "4px 6px",
            borderRadius: 3,
            background: "rgba(248,113,113,0.08)",
          }}
        >
          {loadError}
        </div>
      )}

      {types.length === 0 && !loading && !loadError && (
        <div
          data-testid="custom-type-picker-empty"
          style={{
            fontSize: 10,
            color: "var(--text-muted, rgba(255,255,255,0.4))",
            fontStyle: "italic",
            padding: "4px 6px",
          }}
        >
          No custom types yet. Register one via /api/v1/chart-types.
        </div>
      )}

      {Object.entries(grouped).map(([cat, catTypes]) => (
        <div key={cat} data-testid={`custom-type-group-${cat}`}>
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-muted, rgba(255,255,255,0.35))",
              padding: "4px 4px 2px",
            }}
          >
            {cat}
          </div>
          {catTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`custom-type-item-${t.id}`}
              onClick={() => setSelectedTypeId(t.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                marginBottom: 2,
                fontSize: 11,
                color: "var(--text-primary, #e7e7ea)",
                background:
                  selectedTypeId === t.id
                    ? "var(--bg-elev-2, rgba(255,255,255,0.05))"
                    : "transparent",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              {t.description && (
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted, rgba(255,255,255,0.45))",
                    marginTop: 2,
                  }}
                >
                  {t.description}
                </div>
              )}
            </button>
          ))}
        </div>
      ))}

      {selectedType && (
        <CustomTypeParamForm
          type={selectedType}
          columnProfile={columnProfile}
          onCancel={handleClose}
          onSubmit={(params) => handleInstantiate(selectedType.id, params)}
        />
      )}
    </div>
  );
}

function CustomTypeParamForm({ type, columnProfile, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => {
    const out = {};
    for (const p of type.parameters || []) {
      if (p.default !== undefined) out[p.name] = p.default;
    }
    return out;
  });
  const [error, setError] = useState(null);

  const handleChange = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = onSubmit(values);
    if (result && !result.ok) {
      setError(result.error);
    }
  };

  return (
    <form
      data-testid="custom-type-param-form"
      data-type-id={type.id}
      onSubmit={handleSubmit}
      style={{
        marginTop: 6,
        padding: 8,
        borderRadius: 3,
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
        background: "var(--bg-elev-2, rgba(255,255,255,0.03))",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-secondary, #b0b0b6)",
        }}
      >
        {type.name} — parameters
      </div>
      {(type.parameters || []).map((p) => (
        <ParamInput
          key={p.name}
          param={p}
          value={values[p.name]}
          columnProfile={columnProfile}
          onChange={(v) => handleChange(p.name, v)}
        />
      ))}
      {error && (
        <div
          data-testid="custom-type-param-error"
          style={{
            fontSize: 10,
            color: "#f87171",
            padding: "2px 4px",
            borderRadius: 3,
            background: "rgba(248,113,113,0.08)",
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button
          type="submit"
          data-testid="custom-type-param-submit"
          style={{
            flex: 1,
            padding: "5px 8px",
            fontSize: 10,
            background: "var(--accent, #60a5fa)",
            color: "#06060e",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Apply
        </button>
        <button
          type="button"
          data-testid="custom-type-param-cancel"
          onClick={onCancel}
          style={{
            padding: "5px 8px",
            fontSize: 10,
            background: "transparent",
            color: "var(--text-secondary, #b0b0b6)",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ParamInput({ param, value, columnProfile, onChange }) {
  const label = param.label || param.name;
  const valStr = value === undefined || value === null ? "" : String(value);

  if (param.kind === "field") {
    if (columnProfile && columnProfile.length > 0) {
      return (
        <LabeledRow label={label} required={param.required !== false}>
          <select
            data-testid={`custom-type-param-${param.name}`}
            value={valStr}
            onChange={(e) => onChange(e.target.value)}
            style={selectStyle}
          >
            <option value="">— pick column —</option>
            {columnProfile.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </LabeledRow>
      );
    }
    return (
      <LabeledRow label={label} required={param.required !== false}>
        <input
          type="text"
          data-testid={`custom-type-param-${param.name}`}
          value={valStr}
          onChange={(e) => onChange(e.target.value)}
          placeholder="column name"
          style={inputStyle}
        />
      </LabeledRow>
    );
  }

  if (param.kind === "aggregate") {
    return (
      <LabeledRow label={label} required={param.required !== false}>
        <select
          data-testid={`custom-type-param-${param.name}`}
          value={valStr}
          onChange={(e) => onChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">— pick aggregate —</option>
          {AGGREGATE_OPTIONS.map((agg) => (
            <option key={agg} value={agg}>
              {agg}
            </option>
          ))}
        </select>
      </LabeledRow>
    );
  }

  if (param.kind === "number") {
    return (
      <LabeledRow label={label} required={param.required !== false}>
        <input
          type="number"
          data-testid={`custom-type-param-${param.name}`}
          value={valStr}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? undefined : Number(v));
          }}
          style={inputStyle}
        />
      </LabeledRow>
    );
  }

  if (param.kind === "boolean") {
    return (
      <LabeledRow label={label} required={param.required !== false}>
        <input
          type="checkbox"
          data-testid={`custom-type-param-${param.name}`}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      </LabeledRow>
    );
  }

  // literal / fallback
  return (
    <LabeledRow label={label} required={param.required !== false}>
      <input
        type="text"
        data-testid={`custom-type-param-${param.name}`}
        value={valStr}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </LabeledRow>
  );
}

function LabeledRow({ label, required, children }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontSize: 10,
        color: "var(--text-secondary, #b0b0b6)",
      }}
    >
      <span>
        {label}
        {required && <span style={{ color: "#f87171" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  padding: "4px 6px",
  fontSize: 10,
  background: "var(--bg-page, #06060e)",
  color: "var(--text-primary, #e7e7ea)",
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
  borderRadius: 3,
};

const selectStyle = inputStyle;
