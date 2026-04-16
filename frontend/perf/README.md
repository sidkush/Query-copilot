# Performance Benchmarks

## 500-Tile Dashboard Scroll

Target metrics:
- Mount 500 tiles: <5s total
- Scroll FPS: p5 ≥50fps (measured via requestAnimationFrame)
- InstancePool active slots: never exceeds pool max (12 default)
- Memory: <700MB estimated

Run: `node perf/bench-500-tile-dashboard.js` (synthetic fixture generation)
Future: Playwright E2E benchmark in `perf/bench-500-tile-dashboard.spec.ts`

## How useViewportMount helps

The bidirectional useViewportMount hook (B5) unmounts off-screen tiles, releasing their InstancePool slots. The benchmark verifies that scrolling through 500 tiles keeps the active pool under the max.
