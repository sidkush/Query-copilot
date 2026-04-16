import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { api } from "../../api";

/**
 * SemanticFieldRail — Sub-project D UI hook (Phase 4c).
 *
 * Renders the active SemanticModel's dimensions / measures / metrics as
 * three draggable pill groups inside an accordion. Dropping a pill into
 * a ChannelSlot delivers a payload with a `semantic` envelope; MarksCard
 * resolves it via `resolveSemanticRef()` at drop time.
 *
 * Hydration:
 *   - On mount, calls `api.listSemanticModels()` and stores the list in
 *     the Zustand `availableSemanticModels` slice.
 *   - The first model auto-becomes `activeSemanticModel` if nothing is
 *     already selected.
 *   - A dropdown at the top of the rail lets the user switch models.
 *
 * Drag payload shape (still `application/x-askdb-field` media type):
 *   {
 *     field: 'semantic:<id>',            // hint for devtools only
 *     semanticType: '<inferred>',        // so ChannelSlot's semantic-aware
 *                                        // allow-list can gate on it
 *     role: 'dimension'|'measure',       // so auto-aggregation applies
 *     semantic: { dimension|measure|metric: '<id>' }
 *   }
 */
export default function SemanticFieldRail() {
  const activeSemanticModel = useStore((s) => s.activeSemanticModel);
  const availableSemanticModels = useStore((s) => s.availableSemanticModels);
  const setActiveSemanticModel = useStore((s) => s.setActiveSemanticModel);
  const setAvailableSemanticModels = useStore((s) => s.setAvailableSemanticModels);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await api.listSemanticModels();
        const models = resp?.semantic_models || [];
        if (cancelled) return;
        setAvailableSemanticModels(models);
        if (!activeSemanticModel && models.length > 0) {
          setActiveSemanticModel(models[0]);
        }
        setLoadError(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModelChange = (e) => {
    const id = e.target.value;
    const model = availableSemanticModels.find((m) => m.id === id);
    if (model) setActiveSemanticModel(model);
  };

  const suggestedCount = [
    ...(activeSemanticModel?.dimensions || []),
    ...(activeSemanticModel?.measures || []),
    ...(activeSemanticModel?.metrics || []),
  ].filter((e) => e.status === "suggested").length;

  return (
    <div
      data-testid="semantic-field-rail"
      data-active-model-id={activeSemanticModel?.id || ""}
      style={{
        display: "flex",
        flexDirection: "column",
        marginBottom: 12,
        borderRadius: 4,
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
      }}
    >
      <button
        type="button"
        data-testid="semantic-field-rail-toggle"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "6px 8px",
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-secondary, #b0b0b6)",
          background: "transparent",
          border: "none",
          borderBottom: open
            ? "1px solid var(--border-subtle, rgba(255,255,255,0.06))"
            : "none",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center" }}>
          Semantic fields
          {suggestedCount > 0 && (
            <span
              data-testid="semantic-field-rail-suggested-badge"
              style={{
                background: "#f59e0b",
                color: "#000",
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 10,
                marginLeft: 6,
              }}
            >
              {suggestedCount}
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: 8,
            color: "var(--text-muted, rgba(255,255,255,0.4))",
          }}
        >
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && (
            <div
              data-testid="semantic-field-rail-loading"
              style={{ fontSize: 10, color: "var(--text-muted, rgba(255,255,255,0.4))" }}
            >
              loading…
            </div>
          )}
          {loadError && (
            <div
              data-testid="semantic-field-rail-error"
              style={{
                fontSize: 10,
                color: "#f87171",
                padding: "2px 4px",
                borderRadius: 3,
                background: "rgba(248,113,113,0.08)",
              }}
            >
              {loadError}
            </div>
          )}
          {!loading && availableSemanticModels.length === 0 && !loadError && (
            <div
              data-testid="semantic-field-rail-empty"
              style={{
                fontSize: 10,
                color: "var(--text-muted, rgba(255,255,255,0.4))",
                fontStyle: "italic",
              }}
            >
              No semantic models yet. Register one via /api/v1/semantic-models.
            </div>
          )}
          {availableSemanticModels.length > 1 && (
            <select
              data-testid="semantic-field-rail-model-select"
              value={activeSemanticModel?.id || ""}
              onChange={handleModelChange}
              style={{
                padding: "4px 6px",
                fontSize: 10,
                background: "var(--bg-page, #06060e)",
                color: "var(--text-primary, #e7e7ea)",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
                borderRadius: 3,
              }}
            >
              {availableSemanticModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
          )}
          {activeSemanticModel && (
            <SemanticModelFields model={activeSemanticModel} />
          )}
          <a
            href="/semantic-settings"
            style={{
              fontSize: 11,
              color: "#3b82f6",
              marginTop: 8,
              display: "block",
              textDecoration: "none",
            }}
          >
            Edit semantic model →
          </a>
        </div>
      )}
    </div>
  );
}

function SemanticModelFields({ model }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <PillGroup
        title="Dimensions"
        entries={model.dimensions || []}
        kind="dimension"
        color="#4a8fe7"
      />
      <PillGroup
        title="Measures"
        entries={model.measures || []}
        kind="measure"
        color="#2dbf71"
      />
      <PillGroup
        title="Metrics"
        entries={model.metrics || []}
        kind="metric"
        color="#e0b862"
      />
    </div>
  );
}

function PillGroup({ title, entries, kind, color }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div data-testid={`semantic-group-${kind}`}>
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-muted, rgba(255,255,255,0.4))",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {entries.map((e) => (
          <SemanticPill key={e.id} entry={e} kind={kind} color={color} />
        ))}
      </div>
    </div>
  );
}

function SemanticPill({ entry, kind, color }) {
  // Role mapping for ChannelSlot's semantic-aware allow-list:
  // - measure/metric drops go through as "measure"
  // - dimension drops go through as "dimension"
  const role = kind === "dimension" ? "dimension" : "measure";
  // Pre-infer the semanticType so ChannelSlot can gate on it without the
  // full model lookup at drop-time.
  const semanticType =
    kind === "dimension"
      ? entry.semanticType || "nominal"
      : "quantitative";

  const handleDragStart = (e) => {
    const payload = {
      field: `semantic:${entry.id}`,
      semanticType,
      role,
      semantic: { [kind]: entry.id },
    };
    e.dataTransfer.setData("application/x-askdb-field", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copyMove";
  };

  return (
    <div
      draggable
      data-testid={`semantic-pill-${entry.id}`}
      data-kind={kind}
      onDragStart={handleDragStart}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        fontSize: 10,
        fontWeight: 600,
        color: "#06060e",
        background: color,
        borderRadius: 10,
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {entry.label || entry.id}
    </div>
  );
}
