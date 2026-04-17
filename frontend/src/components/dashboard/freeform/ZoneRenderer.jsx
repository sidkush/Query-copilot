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
  return renderNode(root, resolvedMap, renderLeaf, 0, ctx);
}

function renderNode(zone, resolvedMap, renderLeaf, depth, ctx) {
  const resolved = resolvedMap.get(zone.id);
  if (!resolved) return null;
  if (!evaluateRule(zone.visibilityRule, ctx)) return null;

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
          left: resolved.x,
          top: resolved.y,
          width: resolved.width,
          height: resolved.height,
        }}
      >
        {zone.children.map((child) => renderNode(child, resolvedMap, renderLeaf, depth + 1, ctx))}
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
        left: resolved.x,
        top: resolved.y,
        width: resolved.width,
        height: resolved.height,
      }}
    >
      {renderLeaf(zone, resolved)}
    </div>
  );
}

export default memo(ZoneRenderer);
