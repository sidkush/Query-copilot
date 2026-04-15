import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * ECharts guard — Phase 4c cutover hardening.
 *
 * The new editor paths must stay echarts-free so the cutover can
 * eventually drop the legacy chart library entirely (Phase 4c+1). This
 * test walks every file under the new-editor directories and fails if
 * any `echarts` / `echarts-for-react` import sneaks in.
 *
 * Allowed (rollback safety — excluded from this scan):
 *   - src/components/ResultsChart.jsx
 *   - src/components/dashboard/CanvasChart.jsx
 *   - src/components/dashboard/TileEditor.jsx
 *   - src/components/charts/defs/chartDefs.js
 *
 * Scanned directories:
 *   - src/components/editor/**
 *   - src/components/dashboard/DashboardShell.jsx
 *   - src/components/dashboard/modes/**
 *   - src/components/dashboard/lib/**
 */
const FRONTEND_SRC = resolve(__dirname, '..', '..', '..', '..', 'src');
const SCAN_DIRS = [
  join(FRONTEND_SRC, 'components', 'editor'),
  join(FRONTEND_SRC, 'components', 'dashboard', 'modes'),
  join(FRONTEND_SRC, 'components', 'dashboard', 'lib'),
];
const SCAN_FILES = [
  join(FRONTEND_SRC, 'components', 'dashboard', 'DashboardShell.jsx'),
  join(FRONTEND_SRC, 'components', 'dashboard', 'DashboardModeToggle.jsx'),
];

const ECHARTS_PATTERN = /(?:from\s+['"](?:echarts|echarts-for-react)(?:\/[^'"]*)?['"]|import\s*\(\s*['"](?:echarts|echarts-for-react))/;

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (
      entry.endsWith('.jsx') ||
      entry.endsWith('.js') ||
      entry.endsWith('.tsx') ||
      entry.endsWith('.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('ECharts guard — new editor paths', () => {
  it('new-editor source files do not import echarts or echarts-for-react', () => {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) files.push(...walk(dir));
    for (const f of SCAN_FILES) files.push(f);
    const offenders: Array<{ file: string; match: string }> = [];
    for (const file of files) {
      let contents: string;
      try {
        contents = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const match = contents.match(ECHARTS_PATTERN);
      if (match) {
        offenders.push({ file, match: match[0] });
      }
    }
    expect(
      offenders,
      `Offending files:\n${offenders.map((o) => `  ${o.file} — ${o.match}`).join('\n')}`,
    ).toEqual([]);
  });
});
