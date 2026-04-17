// frontend/src/components/dashboard/freeform/ZoneRenderer.jsx
import { memo } from 'react';
import { isContainer } from './lib/zoneTree';

/**
 * Recursively renders a tiled zone tree using pre-resolved pixel coordinates.
 *
 * - Uses a lookup map (id → ResolvedZone) for O(1) access during recursion.
 * - Containers render as positioned <div>s with their children nested.
 * - Leaves delegate to the consumer-provided `renderLeaf(zone, resolved)` function.
 *
 * This keeps the renderer generic — the consumer (FreeformCanvas) decides
 * how a 'worksheet' leaf becomes a ChartEditor mount, a 'text' leaf becomes
 * a TextTile, etc.
 */
function ZoneRenderer({ root, resolvedMap, renderLeaf }) {
  return renderNode(root, resolvedMap, renderLeaf, 0);
}

function renderNode(zone, resolvedMap, renderLeaf, depth) {
  const resolved = resolvedMap.get(zone.id);
  if (!resolved) return null;

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
        {zone.children.map((child) => renderNode(child, resolvedMap, renderLeaf, depth + 1))}
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
