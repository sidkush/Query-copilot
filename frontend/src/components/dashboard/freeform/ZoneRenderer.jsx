// frontend/src/components/dashboard/freeform/ZoneRenderer.jsx
import { memo, useMemo } from 'react';
import { isContainer } from './lib/zoneTree';
import { evaluateRule, buildEvaluationContext } from './lib/visibilityRules';
import { useStore } from '../../../store';

const EMPTY_SETS = Object.freeze([]);
const EMPTY_PARAMS = Object.freeze([]);
const EMPTY_FILTERS = Object.freeze({});

/**
 * Recursively renders a tiled zone tree using pre-resolved pixel coordinates.
 * Plan 4d: every recursion step short-circuits when the zone's
 * visibilityRule evaluates to false. Container subtrees are unmounted as a
 * unit — children of a hidden container never enter renderNode.
 */
function ZoneRenderer({ root, resolvedMap, renderLeaf }) {
  const sets = useStore((s) => s.analystProDashboard?.sets ?? EMPTY_SETS);
  const parameters = useStore((s) => s.analystProDashboard?.parameters ?? EMPTY_PARAMS);
  const sheetFilters = useStore((s) => s.analystProSheetFilters ?? EMPTY_FILTERS);
  const ctx = useMemo(
    () => buildEvaluationContext({ sets, parameters, sheetFilters }),
    [sets, parameters, sheetFilters],
  );
  return renderNode(root, resolvedMap, renderLeaf, 0, ctx, null);
}

// Plan 7 T15 follow-up — resolvedMap stores canvas-absolute (x, y) for every
// node. When we render containers AS nesting divs (position:absolute inside
// their parent container, which is itself position:absolute), the browser
// compounds the offsets: a child with top:174 inside a container at top:174
// ends up at 348 visually, producing huge gaps between rows.
//
// Fix: translate to parent-relative coordinates at render time. The root has
// no parent, so it renders at its absolute (x, y). Every descendant renders
// at (x - parentX, y - parentY), i.e. relative to its direct ancestor.
function renderNode(zone, resolvedMap, renderLeaf, depth, ctx, parentResolved) {
  const resolved = resolvedMap.get(zone.id);
  if (!resolved) return null;
  if (!evaluateRule(zone.visibilityRule, ctx)) return null;

  const relX = parentResolved ? resolved.x - parentResolved.x : resolved.x;
  const relY = parentResolved ? resolved.y - parentResolved.y : resolved.y;

  if (isContainer(zone)) {
    return (
      <div
        key={zone.id}
        data-testid={`tiled-container-${zone.id}`}
        data-zone={zone.id}
        data-zone-type={zone.type}
        data-container-depth={depth}
        style={{
          position: 'absolute',
          left: relX,
          top: relY,
          width: resolved.width,
          height: resolved.height,
        }}
      >
        {zone.children.map((child) => renderNode(child, resolvedMap, renderLeaf, depth + 1, ctx, resolved))}
      </div>
    );
  }

  return (
    <div
      key={zone.id}
      data-testid={`tiled-leaf-${zone.id}`}
      data-zone={zone.id}
      data-zone-type={zone.type}
      style={{
        position: 'absolute',
        left: relX,
        top: relY,
        width: resolved.width,
        height: resolved.height,
      }}
    >
      {renderLeaf(zone, resolved)}
    </div>
  );
}

export default memo(ZoneRenderer);
