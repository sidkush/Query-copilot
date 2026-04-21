/* global __dirname */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('DashboardShell lazy-loading guards', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/dashboard/DashboardShell.jsx'),
    'utf-8',
  );

  // After Wave 2-A of the preset infrastructure plan (2026-04-18) the shell
  // renders a single Analyst Pro layout. Sibling archetype layouts were
  // deleted along with their lazy wrappers.
  it('uses lazy() for AnalystProLayout', () => {
    expect(src).not.toMatch(/^import\s+AnalystProLayout\s+from/m);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\([^)]*AnalystProLayout/);
  });

  it('uses lazy() for VoiceModeSelector', () => {
    expect(src).not.toMatch(/^import\s+VoiceModeSelector\s+from/m);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\([^)]*VoiceModeSelector/);
  });

  it('uses lazy() for VoiceTranscriptOverlay', () => {
    expect(src).not.toMatch(/^import\s+VoiceTranscriptOverlay\s+from/m);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\([^)]*VoiceTranscriptOverlay/);
  });

  it('does not import deleted archetype layouts', () => {
    for (const removed of [
      'ExecBriefingLayout',
      'AnalystWorkbenchLayout',
      'LiveOpsLayout',
      'StoryLayout',
      'PitchLayout',
      'WorkbookLayout',
      'TableauClassicLayout',
      'MobileLayout',
    ]) {
      expect(src).not.toContain(removed);
    }
  });
});
