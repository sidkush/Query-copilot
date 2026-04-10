import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useStore } from "../store";

/**
 * SVG-based ER Diagram that renders tables as draggable rectangles
 * with columns, and FK relationships as connecting lines.
 */
export default function ERDiagram({ tables = [], compact = false, savedPositions = null, onPositionsChange = null }) {
  const resolvedTheme = useStore((s) => s.resolvedTheme);
  const [hoveredTable, setHoveredTable] = useState(null);
  const [nodePositions, setNodePositions] = useState(null);
  const [dragState, setDragState] = useState(null); // { nodeName, offsetX, offsetY }
  const [hasDragged, setHasDragged] = useState({}); // tracks which nodes have been dragged (skip animation)
  const svgRef = useRef(null);

  // Theme-aware colors for SVG elements
  const erColors = useMemo(() => resolvedTheme === 'light'
    ? { nodeBg: '#ffffff', nodeHoverBg: '#f8fafc', nodeBorder: '#d1d5db', shadow: 'rgba(0,0,0,0.08)', colText: '#374151', typeText: '#9ca3af', dotDefault: '#9ca3af' }
    : { nodeBg: '#111827', nodeHoverBg: '#1e1e2e', nodeBorder: '#374151', shadow: 'rgba(0,0,0,0.3)', colText: '#d1d5db', typeText: '#6b7280', dotDefault: '#4b5563' },
  [resolvedTheme]);

  // Layout constants
  const COL_GAP = 320;
  const ROW_GAP = 40;
  const TABLE_W = 260;
  const COL_H = 22;
  const HEADER_H = 36;
  const PAD = 12;

  // Compute initial layout from tables prop
  const initialLayout = useMemo(() => {
    if (!tables.length) return { nodes: [], width: 0, height: 0 };

    const COLS_PER_ROW = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(tables.length))));

    const nodes = tables.map((t, i) => {
      const col = i % COLS_PER_ROW;
      const row = Math.floor(i / COLS_PER_ROW);
      const height = HEADER_H + t.columns.length * COL_H + PAD * 2;
      return {
        ...t,
        x: 40 + col * COL_GAP,
        y: 40 + row * (250 + ROW_GAP),
        w: TABLE_W,
        h: height,
      };
    });

    return { nodes };
  }, [tables]);

  // Initialize positions from saved positions (if any) or layout defaults
  useEffect(() => {
    if (!initialLayout.nodes.length) {
      setNodePositions(null);
      return;
    }
    const positions = {};
    initialLayout.nodes.forEach((n) => {
      if (savedPositions && savedPositions[n.name]) {
        positions[n.name] = { x: savedPositions[n.name].x, y: savedPositions[n.name].y };
      } else {
        positions[n.name] = { x: n.x, y: n.y };
      }
    });
    setNodePositions(positions);
    // Mark nodes with saved positions as already dragged (skip entrance animation)
    const dragged = {};
    if (savedPositions) {
      initialLayout.nodes.forEach((n) => {
        if (savedPositions[n.name]) dragged[n.name] = true;
      });
    }
    setHasDragged(dragged);
  }, [initialLayout, savedPositions]);

  // Build the current nodes list by merging table data with live positions
  const nodes = useMemo(() => {
    if (!nodePositions || !initialLayout.nodes.length) return [];
    return initialLayout.nodes.map((n) => {
      const pos = nodePositions[n.name] || { x: n.x, y: n.y };
      return { ...n, x: pos.x, y: pos.y };
    });
  }, [initialLayout, nodePositions]);

  // Compute edges from current node positions
  const edges = useMemo(() => {
    if (!nodes.length) return [];
    const nodeMap = {};
    nodes.forEach((n) => { nodeMap[n.name] = n; });

    const result = [];
    nodes.forEach((n) => {
      (n.foreign_keys || []).forEach((fk) => {
        const target = nodeMap[fk.referred_table];
        if (!target) return;
        result.push({
          from: { x: n.x + n.w, y: n.y + HEADER_H + 10 },
          to: { x: target.x, y: target.y + HEADER_H + 10 },
          label: fk.columns.join(", "),
        });
      });
    });
    return result;
  }, [nodes]);

  // Compute SVG dimensions from current positions
  const svgWidth = useMemo(() => {
    if (!nodes.length) return 0;
    return Math.max(...nodes.map((n) => n.x + n.w)) + 80;
  }, [nodes]);

  const svgHeight = useMemo(() => {
    if (!nodes.length) return 0;
    return Math.max(...nodes.map((n) => n.y + n.h)) + 80;
  }, [nodes]);

  // Convert screen coordinates to SVG coordinates
  const screenToSVG = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  // Mouse down on a table node - begin drag
  const handleMouseDown = useCallback((e, nodeName) => {
    // Only handle left mouse button
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const svgPt = screenToSVG(e.clientX, e.clientY);
    const pos = nodePositions[nodeName];
    if (!pos) return;

    setDragState({
      nodeName,
      offsetX: svgPt.x - pos.x,
      offsetY: svgPt.y - pos.y,
    });
  }, [nodePositions, screenToSVG]);

  // Mouse move on SVG - update position if dragging
  const handleMouseMove = useCallback((e) => {
    if (!dragState) return;
    e.preventDefault();

    const svgPt = screenToSVG(e.clientX, e.clientY);
    const newX = svgPt.x - dragState.offsetX;
    const newY = svgPt.y - dragState.offsetY;

    setNodePositions((prev) => ({
      ...prev,
      [dragState.nodeName]: { x: newX, y: newY },
    }));

    setHasDragged((prev) => {
      if (prev[dragState.nodeName]) return prev;
      return { ...prev, [dragState.nodeName]: true };
    });
  }, [dragState, screenToSVG]);

  // Mouse up - end drag and notify parent of new positions
  const handleMouseUp = useCallback(() => {
    if (!dragState) return;
    setDragState(null);
    if (onPositionsChange && nodePositions) {
      onPositionsChange({ ...nodePositions });
    }
  }, [dragState, nodePositions, onPositionsChange]);

  // Attach mousemove/mouseup to window so dragging works even outside SVG bounds
  useEffect(() => {
    if (!dragState) return;

    const onMove = (e) => handleMouseMove(e);
    const onUp = () => handleMouseUp();

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, handleMouseMove, handleMouseUp]);

  if (!tables.length) return null;

  const isDragging = dragState !== null;

  return (
    <div className={`overflow-auto rounded-2xl ${compact ? "h-full" : ""}`} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      <svg
        ref={svgRef}
        width={compact ? "100%" : svgWidth}
        height={compact ? "100%" : svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio={compact ? "xMidYMin meet" : undefined}
        className={compact ? "w-full h-full" : "min-w-full"}
        style={{ cursor: isDragging ? "grabbing" : undefined }}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
          </marker>
          <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>

        {/* FK relationship lines */}
        {edges.map((e, i) => {
          const midX = (e.from.x + e.to.x) / 2;
          return (
            <g key={`edge-${i}`}>
              <path
                d={`M ${e.from.x} ${e.from.y} C ${midX} ${e.from.y}, ${midX} ${e.to.y}, ${e.to.x} ${e.to.y}`}
                fill="none"
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeOpacity="0.5"
                markerEnd="url(#arrowhead)"
              />
            </g>
          );
        })}

        {/* Table nodes */}
        {nodes.map((node, ni) => {
          const isHovered = hoveredTable === node.name;
          const isBeingDragged = dragState?.nodeName === node.name;
          const skipAnimation = hasDragged[node.name];

          return (
            <g
              key={node.name}
              style={
                skipAnimation
                  ? { cursor: isBeingDragged ? "grabbing" : "grab" }
                  : {
                      opacity: 0,
                      animation: `scaleIn 0.5s ease-out ${ni * 0.1}s forwards`,
                      cursor: isBeingDragged ? "grabbing" : "grab",
                    }
              }
              onMouseEnter={() => { if (!isDragging) setHoveredTable(node.name); }}
              onMouseLeave={() => { if (!isDragging) setHoveredTable(null); }}
              onMouseDown={(e) => handleMouseDown(e, node.name)}
            >
              {/* Shadow */}
              <rect
                x={node.x + 2}
                y={node.y + 2}
                width={node.w}
                height={node.h}
                rx="12"
                fill={erColors.shadow}
              />
              {/* Background */}
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx="12"
                fill={isHovered ? erColors.nodeHoverBg : erColors.nodeBg}
                stroke={isHovered ? "#6366f1" : erColors.nodeBorder}
                strokeWidth={isHovered ? "2" : "1"}
              />
              {/* Header bar */}
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height="36"
                rx="12"
                fill="url(#headerGrad)"
              />
              <rect
                x={node.x}
                y={node.y + 24}
                width={node.w}
                height="12"
                fill="url(#headerGrad)"
              />
              <text
                x={node.x + 14}
                y={node.y + 24}
                fill="white"
                fontSize="13"
                fontWeight="700"
                fontFamily="Inter, sans-serif"
              >
                {node.name}
              </text>

              {/* Columns */}
              {node.columns.map((col, ci) => {
                const isPK = (node.primary_key || []).includes(col.name);
                const isFK = (node.foreign_keys || []).some((fk) => fk.columns.includes(col.name));
                const y = node.y + 36 + 12 + ci * 22;
                return (
                  <g key={col.name}>
                    {/* PK/FK indicator dot */}
                    <circle
                      cx={node.x + 18}
                      cy={y}
                      r="4"
                      fill={isPK ? "#eab308" : isFK ? "#6366f1" : erColors.dotDefault}
                    />
                    <text x={node.x + 30} y={y + 4} fill={erColors.colText} fontSize="11" fontFamily="monospace">
                      {col.name}
                    </text>
                    <text
                      x={node.x + node.w - 14}
                      y={y + 4}
                      fill={erColors.typeText}
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {String(col.type).toLowerCase().split("(")[0]}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
