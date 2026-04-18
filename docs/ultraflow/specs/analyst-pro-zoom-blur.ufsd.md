approach=canvas-dpr-zoom-compensation | confidence=8 | session=2026-04-18 | outcome=RESOLVED

## Debug Session 2026-04-18
Decisions: H1 (canvas backing store ignores CSS transform scale) selected over H2 (ResizeObserver returns wrong size) — H2 is a symptom of H1. Even if ResizeObserver returned post-transform size, the canvas still needs zoom in the DPR computation.
Fix summary: VizQLRenderer now reads `analystProCanvasZoom` from Zustand and computes `effectiveScale = dpr * cssZoom`. Canvas backing store uses `cssWidth * effectiveScale` instead of `cssWidth * dpr`. Context setTransform uses `effectiveScale` so drawing commands remain in CSS pixel space.
Assumption outcomes:
  - ASSUMPTION: Zoom uses CSS transform: scale() | VALIDATED: yes | IMPACT: confirmed mechanism
  - ASSUMPTION: ResizeObserver.contentRect returns pre-transform dimensions | VALIDATED: yes | IMPACT: confirmed why canvas resolution was wrong
  - ASSUMPTION: VizQLRenderer only uses dpr, not zoom | VALIDATED: yes | IMPACT: root cause confirmed
  - ASSUMPTION: VegaRenderer has same issue | VALIDATED: yes but SVG-based so resolution-independent | IMPACT: no practical gap
Unvalidated assumptions (risk items): none
Cascade paths verified: VizQLRenderer (primary, fixed) | VegaRenderer (deprecated, lazy, SVG-based — no practical gap) | Animation canvases (Aurora, DataMesh, SectionBg — not inside zoom container, not affected)
