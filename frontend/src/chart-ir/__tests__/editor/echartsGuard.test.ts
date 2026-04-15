import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * ECharts guard — Phase 4c+3 (full cutover).
 *
 * Scope expanded after Phase 4c+3 deletion of the entire legacy chart
 * stack. ECharts and `echarts-for-react` are uninstalled from
 * package.json; this test walks every file in `src/` and fails if any
 * import re-introduces the dependency. No carve-outs remain.
 */
const FRONTEND_SRC = resolve(__dirname, '..', '..', '..', '..', 'src');
const SCAN_DIRS = [FRONTEND_SRC];
const SCAN_FILES: string[] = [];

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
