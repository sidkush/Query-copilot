/**
 * LayoutTreePanel — hierarchical outline of all zones in the Analyst Pro dashboard.
 *
 * Renders two sections:
 *   ▼ Tiled — depth-first walk of tiledRoot (ContainerZone tree)
 *   ▼ Floating — flat list of floatingLayer zones
 *
 * Interactions:
 *   - Click          → select zone (replaces selection)
 *   - Cmd/Ctrl+Click → toggle zone in/out of multi-selection
 *   - Double-click   → inline rename (Enter = commit, Escape = cancel, blur = commit)
 *
 * Styling uses the same CSS variable tokens as ObjectLibraryPanel and the
 * chrome bar components (chrome-bar-bg, chrome-bar-border, fg, bg-selected,
 * bg-hover). No Framer Motion — plain React state for the editing flag.
 *
 * Plan 2b — Task T8.
 */

import React, { useMemo, useState } from 'react';
import { useStore } from '../../../../store';
import { evaluateRule, buildEvaluationContext } from '../lib/visibilityRules';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ruleSummary(rule) {
  if (!rule) return '';
  switch (rule.kind) {
    case 'setMembership': return `set ${rule.setId} ${rule.mode}`;
    case 'parameterEquals': return `param ${rule.parameterId} = ${String(rule.value)}`;
    case 'hasActiveFilter': return `sheet ${rule.sheetId} has filter`;
    case 'always':
    default: return '';
  }
}

function zoneFallbackName(zone) {
  // First 4 chars of the id give a readable short code, e.g. '#3ab2'
  const short = String(zone.id).slice(0, 4);
  if (zone.type === 'container-horz') return `Horz Container #${short}`;
  if (zone.type === 'container-vert') return `Vert Container #${short}`;
  const cap = zone.type.charAt(0).toUpperCase() + zone.type.slice(1);
  return `${cap} #${short}`;
}

/** Depth-first pre-order walk of a tiled zone tree. */
function walkTiled(zone, depth = 0, out = []) {
  out.push({ zone, depth });
  if (zone.children) {
    zone.children.forEach((c) => walkTiled(c, depth + 1, out));
  }
  return out;
}

// ---------------------------------------------------------------------------
// TreeRow
// ---------------------------------------------------------------------------

function TreeRow({ zone, depth, selected, onClick, onRename, ctx }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const name = zone.displayName || zoneFallbackName(zone);
  const hasRule = !!zone.visibilityRule && zone.visibilityRule.kind !== 'always';
  const visible = !hasRule || evaluateRule(zone.visibilityRule, ctx);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onRename(zone.id, trimmed);
    }
    setEditing(false);
  };

  // ---- Editing state: render an inline text input ----
  if (editing) {
    return (
      <div
        role="listitem"
        className="tree-row editing"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            else if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={commitRename}
          aria-label={`Rename ${name}`}
          style={{
            width: '100%',
            background: 'var(--bg-input, #1a1a2e)',
            border: '1px solid var(--accent, #6c63ff)',
            color: 'var(--fg)',
            borderRadius: '3px',
            padding: '2px 4px',
            fontSize: '12px',
            outline: 'none',
          }}
        />
      </div>
    );
  }

  // ---- Normal state: render a clickable/double-clickable row ----
  return (
    <div
      role="button"
      tabIndex={0}
      data-visibility-hidden={hasRule ? String(!visible) : 'false'}
      className={`tree-row${selected ? ' selected' : ''}`}
      style={{
        paddingLeft: depth * 12 + 8,
        paddingRight: 6,
        paddingTop: 3,
        paddingBottom: 3,
        background: selected
          ? 'var(--bg-selected, var(--bg-hover, rgba(108,99,255,0.18)))'
          : 'transparent',
        opacity: visible ? 1 : 0.45,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: '12px',
      }}
      onClick={(e) => onClick(zone.id, e)}
      onDoubleClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(zone.id, e);
        }
      }}
    >
      {/* Zone-type icon */}
      <span aria-hidden="true" style={{ opacity: 0.6, flexShrink: 0 }}>
        {zone.type === 'container-horz'
          ? '▭'
          : zone.type === 'container-vert'
          ? '▯'
          : '•'}
      </span>

      {/* Zone name — truncated when long */}
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>

      {/* Lock badge */}
      {zone.locked ? (
        <span aria-label="Locked" style={{ flexShrink: 0 }}>
          🔒
        </span>
      ) : null}

      {/* Visibility-rule glyph (Plan 4d) */}
      {hasRule ? (
        <span
          data-testid={`visibility-glyph-${zone.id}`}
          aria-label={visible ? 'Visibility rule active' : 'Hidden by visibility rule'}
          title={ruleSummary(zone.visibilityRule)}
          style={{ flexShrink: 0, opacity: 0.8 }}
        >
          ◉
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayoutTreePanel (default export)
// ---------------------------------------------------------------------------

export default function LayoutTreePanel() {
  const dashboard = useStore((s) => s.analystProDashboard);
  const selection = useStore((s) => s.analystProSelection);
  const setSelection = useStore((s) => s.setAnalystProSelection);
  const addToSelection = useStore((s) => s.addToSelection);
  const removeFromSelection = useStore((s) => s.removeFromSelection);
  const updateZone = useStore((s) => s.updateZoneAnalystPro);
  const sets = useStore((s) => s.analystProDashboard?.sets || []);
  const parameters = useStore((s) => s.analystProDashboard?.parameters || []);
  const sheetFilters = useStore((s) => s.analystProSheetFilters);
  const ctx = useMemo(
    () => buildEvaluationContext({ sets, parameters, sheetFilters }),
    [sets, parameters, sheetFilters],
  );

  if (!dashboard) return null;

  const handleClick = (id, e) => {
    const isMulti = e.metaKey || e.ctrlKey;
    if (isMulti) {
      if (selection.has(id)) removeFromSelection(id);
      else addToSelection(id);
    } else {
      setSelection([id]);
    }
  };

  const handleRename = (id, displayName) => {
    updateZone(id, { displayName });
  };

  const tiledRows = walkTiled(dashboard.tiledRoot);
  const floatingRows = dashboard.floatingLayer.map((z) => ({ zone: z, depth: 0 }));

  return (
    <aside
      aria-label="Layout tree"
      className="analyst-pro-layout-tree"
      style={{
        background: 'var(--chrome-bar-bg)',
        borderRight: '1px solid var(--chrome-bar-border)',
        color: 'var(--fg)',
        fontSize: '12px',
        userSelect: 'none',
        overflow: 'auto',
      }}
    >
      {/* Panel heading */}
      <div
        style={{
          padding: '8px 12px',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.7,
          fontWeight: 600,
        }}
      >
        Layout
      </div>

      {/* Tiled section */}
      <section>
        <header
          style={{
            padding: '4px 12px',
            opacity: 0.6,
            fontSize: '11px',
          }}
        >
          ▼ Tiled
        </header>
        <div role="list">
          {tiledRows.map(({ zone, depth }) => (
            <TreeRow
              key={zone.id}
              zone={zone}
              depth={depth}
              selected={selection.has(zone.id)}
              onClick={handleClick}
              onRename={handleRename}
              ctx={ctx}
            />
          ))}
        </div>
      </section>

      {/* Floating section */}
      <section>
        <header
          style={{
            padding: '4px 12px',
            opacity: 0.6,
            fontSize: '11px',
          }}
        >
          ▼ Floating
        </header>
        <div role="list">
          {floatingRows.map(({ zone, depth }) => (
            <TreeRow
              key={zone.id}
              zone={zone}
              depth={depth}
              selected={selection.has(zone.id)}
              onClick={handleClick}
              onRename={handleRename}
              ctx={ctx}
            />
          ))}
        </div>
      </section>
    </aside>
  );
}
