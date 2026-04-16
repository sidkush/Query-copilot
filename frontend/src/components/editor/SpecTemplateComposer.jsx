import { useCallback, useState } from 'react';
import ParameterEditor from './ParameterEditor';
import SpecTemplatePreview from './SpecTemplatePreview';
import { api } from '../../api';

/**
 * SpecTemplateComposer — Sub-project C Task 3.
 *
 * Main page for creating a new UserChartType from composable IR primitives.
 * Combines metadata form + ParameterEditor + encoding assignment + mark
 * picker + live SpecTemplatePreview.
 *
 * Layout (CSS Grid):
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Metadata bar: [Name] [Description] [Category ▾] [Save]    │
 *   ├──────────────────────┬───────────────────────────────────────┤
 *   │  Left panel (320px)  │  Right panel (flexible)              │
 *   │  ParameterEditor     │  SpecTemplatePreview                 │
 *   │  Mark type picker    │  (live VegaRenderer w/ mock data)    │
 *   │  Encoding assignment │                                      │
 *   └──────────────────────┴───────────────────────────────────────┘
 *
 * data-testid: spec-template-composer
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARK_OPTIONS = [
  'bar', 'line', 'area', 'point', 'circle', 'arc',
  'rect', 'tick', 'text', 'boxplot', 'rule', 'trail',
];

const ENCODING_CHANNELS = ['x', 'y', 'color', 'size', 'shape', 'opacity'];

const AGGREGATE_OPTIONS = ['sum', 'avg', 'count', 'min', 'max'];

const CATEGORY_OPTIONS = [
  'Custom', 'Org', 'Financial', 'Marketing', 'Sales',
  'Operations', 'Engineering', 'Analytics', 'Other',
];

// ---------------------------------------------------------------------------
// Initial draft state
// ---------------------------------------------------------------------------

function makeDraft() {
  return {
    id: '',
    name: '',
    description: '',
    category: 'Custom',
    schemaVersion: 1,
    parameters: [],
    specTemplate: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {},
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpecTemplateComposer() {
  const [draft, setDraft] = useState(makeDraft);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }
  const [rawMode, setRawMode] = useState(false);

  // Aggregate selections per channel — only relevant for Y
  const [aggregates, setAggregates] = useState({});

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const fieldParams = draft.parameters.filter((p) => p.kind === 'field');

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  // -------------------------------------------------------------------------
  // Metadata handlers
  // -------------------------------------------------------------------------

  const handleNameChange = useCallback((e) => {
    const name = e.target.value;
    const id = name
      ? `user:${name.toLowerCase().replace(/\s+/g, '-')}`
      : '';
    setDraft((prev) => ({ ...prev, name, id }));
  }, []);

  const handleDescriptionChange = useCallback((e) => {
    setDraft((prev) => ({ ...prev, description: e.target.value }));
  }, []);

  const handleCategoryChange = useCallback((e) => {
    setDraft((prev) => ({ ...prev, category: e.target.value }));
  }, []);

  // -------------------------------------------------------------------------
  // Parameters
  // -------------------------------------------------------------------------

  const handleParametersChange = useCallback((nextParams) => {
    setDraft((prev) => {
      // When parameters change, prune encoding channels that reference
      // removed field params.
      const fieldNames = new Set(
        nextParams.filter((p) => p.kind === 'field').map((p) => p.name),
      );
      const nextEncoding = { ...prev.specTemplate.encoding };
      for (const ch of ENCODING_CHANNELS) {
        if (nextEncoding[ch]?.field) {
          // field values are stored as '${paramName}' — extract the name
          const ref = nextEncoding[ch].field.replace(/^\$\{|\}$/g, '');
          if (!fieldNames.has(ref)) {
            delete nextEncoding[ch];
          }
        }
      }
      return {
        ...prev,
        parameters: nextParams,
        specTemplate: {
          ...prev.specTemplate,
          encoding: nextEncoding,
        },
      };
    });
  }, []);

  // -------------------------------------------------------------------------
  // Mark type
  // -------------------------------------------------------------------------

  const handleMarkChange = useCallback((e) => {
    setDraft((prev) => ({
      ...prev,
      specTemplate: { ...prev.specTemplate, mark: e.target.value },
    }));
  }, []);

  // -------------------------------------------------------------------------
  // Encoding assignment
  // -------------------------------------------------------------------------

  function handleEncodingChange(channel, paramName) {
    setDraft((prev) => {
      const nextEncoding = { ...prev.specTemplate.encoding };

      if (!paramName) {
        // Clear the channel
        delete nextEncoding[channel];
      } else {
        const param = prev.parameters.find((p) => p.name === paramName);
        const entry = {
          field: `\${${paramName}}`,
          type: param?.semanticType || 'nominal',
        };
        // Attach aggregate if channel is Y and one is selected
        if (channel === 'y' && aggregates[channel]) {
          entry.aggregate = aggregates[channel];
        }
        nextEncoding[channel] = entry;
      }

      return {
        ...prev,
        specTemplate: { ...prev.specTemplate, encoding: nextEncoding },
      };
    });
  }

  function handleAggregateChange(channel, agg) {
    setAggregates((prev) => ({ ...prev, [channel]: agg || undefined }));
    // Re-apply encoding for the channel if a param is selected
    setDraft((prev) => {
      const current = prev.specTemplate.encoding[channel];
      if (!current) return prev;
      const nextEncoding = { ...prev.specTemplate.encoding };
      nextEncoding[channel] = {
        ...current,
        aggregate: agg || undefined,
      };
      if (!agg) delete nextEncoding[channel].aggregate;
      return {
        ...prev,
        specTemplate: { ...prev.specTemplate, encoding: nextEncoding },
      };
    });
  }

  /** Extract param name from a '${paramName}' field value. */
  function getSelectedParam(channel) {
    const enc = draft.specTemplate.encoding[channel];
    if (!enc?.field) return '';
    return enc.field.replace(/^\$\{|\}$/g, '');
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  async function handleSave() {
    if (!draft.name.trim()) {
      showToast('error', 'Name is required.');
      return;
    }
    setSaving(true);
    try {
      await api.saveChartType(draft);
      showToast('success', `Chart type "${draft.name}" saved.`);
    } catch (err) {
      showToast('error', err?.message || 'Failed to save chart type.');
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      data-testid="spec-template-composer"
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: 'var(--bg-page, #06060e)',
        color: 'var(--text-primary, #e7e7ea)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      {/* ================================================================= */}
      {/*  Metadata bar                                                     */}
      {/* ================================================================= */}
      <div
        data-testid="composer-metadata-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
          background: 'var(--bg-elev-1, rgba(255,255,255,0.02))',
          flexWrap: 'wrap',
        }}
      >
        {/* Name */}
        <input
          type="text"
          placeholder="Chart type name"
          value={draft.name}
          aria-label="Chart type name"
          data-testid="composer-name-input"
          onChange={handleNameChange}
          style={{ ...inputStyle, flex: '1 1 180px', minWidth: 140 }}
        />

        {/* Description */}
        <input
          type="text"
          placeholder="Short description"
          value={draft.description}
          aria-label="Chart type description"
          data-testid="composer-description-input"
          onChange={handleDescriptionChange}
          style={{ ...inputStyle, flex: '2 1 260px', minWidth: 180 }}
        />

        {/* Category */}
        <select
          value={draft.category}
          aria-label="Category"
          data-testid="composer-category-select"
          onChange={handleCategoryChange}
          style={{ ...inputStyle, width: 130, cursor: 'pointer', flexShrink: 0 }}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Save */}
        <button
          type="button"
          data-testid="composer-save-button"
          disabled={saving || !draft.name.trim()}
          onClick={handleSave}
          style={{
            padding: '5px 16px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
            border: '1px solid rgba(96,165,250,0.3)',
            background: saving || !draft.name.trim()
              ? 'rgba(255,255,255,0.04)'
              : 'rgba(96,165,250,0.18)',
            color: saving || !draft.name.trim()
              ? 'rgba(255,255,255,0.3)'
              : 'rgba(147,197,253,1)',
            cursor: saving || !draft.name.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.12s, color 0.12s',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>

        {/* Raw JSON toggle */}
        <button
          type="button"
          data-testid="composer-raw-toggle"
          onClick={() => setRawMode(!rawMode)}
          style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 12,
            background: rawMode ? '#3b82f6' : 'rgba(255,255,255,0.06)',
            color: rawMode ? '#fff' : 'var(--text-secondary)',
            border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {rawMode ? '← Visual' : 'JSON'}
        </button>

        {/* ID preview */}
        {draft.id && (
          <span
            data-testid="composer-id-preview"
            style={{
              fontSize: 10,
              color: 'var(--text-muted, rgba(255,255,255,0.35))',
              fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            id: {draft.id}
          </span>
        )}
      </div>

      {/* ================================================================= */}
      {/*  Body: left panel + right panel                                   */}
      {/* ================================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* ----- Left panel ---- */}
        <div
          data-testid="composer-left-panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: '14px 12px',
            overflowY: 'auto',
            borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
          }}
        >
          {rawMode ? (
            <textarea
              value={JSON.stringify(draft.specTemplate, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setDraft((d) => ({ ...d, specTemplate: parsed }));
                } catch { /* ignore invalid JSON while typing */ }
              }}
              style={{
                width: '100%', height: '100%', fontFamily: 'monospace', fontSize: 12,
                background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: 12, resize: 'none',
                boxSizing: 'border-box',
              }}
              data-testid="raw-json-editor"
            />
          ) : (
            <>
              {/* Parameters */}
              <ParameterEditor
                parameters={draft.parameters}
                onChange={handleParametersChange}
              />

              {/* Mark Type Picker */}
              <Section title="Mark Type">
                <select
                  value={draft.specTemplate.mark}
                  aria-label="Mark type"
                  data-testid="composer-mark-select"
                  onChange={handleMarkChange}
                  style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
                >
                  {MARK_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Section>

              {/* Encoding Assignment */}
              <Section title="Encoding">
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {ENCODING_CHANNELS.map((ch) => (
                    <div
                      key={ch}
                      data-testid={`encoding-channel-${ch}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {/* Channel label */}
                      <span
                        style={{
                          width: 56,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          color: 'var(--text-secondary, #b0b0b6)',
                          flexShrink: 0,
                        }}
                      >
                        {ch}
                      </span>

                      {/* Param dropdown */}
                      <select
                        value={getSelectedParam(ch)}
                        aria-label={`${ch} encoding`}
                        data-testid={`encoding-select-${ch}`}
                        onChange={(e) => handleEncodingChange(ch, e.target.value)}
                        style={{ ...inputStyle, flex: 1, minWidth: 0, cursor: 'pointer' }}
                      >
                        <option value="">(none)</option>
                        {fieldParams.map((p) => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                      </select>

                      {/* Aggregate dropdown — Y channel only */}
                      {ch === 'y' && getSelectedParam(ch) && (
                        <select
                          value={aggregates.y || ''}
                          aria-label="Y aggregate"
                          data-testid="encoding-aggregate-y"
                          onChange={(e) => handleAggregateChange('y', e.target.value)}
                          style={{ ...inputStyle, width: 80, cursor: 'pointer', flexShrink: 0 }}
                        >
                          <option value="">(none)</option>
                          {AGGREGATE_OPTIONS.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>

        {/* ----- Right panel ---- */}
        <div
          data-testid="composer-right-panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: 16,
            minHeight: 0,
            overflow: 'auto',
          }}
        >
          <SpecTemplatePreview chartType={draft} />
        </div>
      </div>

      {/* ================================================================= */}
      {/*  Toast                                                            */}
      {/* ================================================================= */}
      {toast && (
        <div
          data-testid={`composer-toast-${toast.type}`}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '10px 20px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            zIndex: 9999,
            pointerEvents: 'none',
            transition: 'opacity 0.2s',
            ...(toast.type === 'success'
              ? {
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  color: 'rgba(134,239,172,0.95)',
                }
              : {
                  background: 'rgba(229,62,62,0.12)',
                  border: '1px solid rgba(229,62,62,0.3)',
                  color: 'rgba(248,113,113,0.95)',
                }),
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section — tiny styled section wrapper
// ---------------------------------------------------------------------------

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted, rgba(255,255,255,0.45))',
          fontWeight: 700,
          paddingBottom: 4,
          borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style helpers (matches ParameterEditor input styling)
// ---------------------------------------------------------------------------

const inputStyle = {
  padding: '4px 6px',
  fontSize: 11,
  background: 'var(--bg-page, #06060e)',
  color: 'var(--text-primary, #e7e7ea)',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
  borderRadius: 4,
  outline: 'none',
  boxSizing: 'border-box',
};
