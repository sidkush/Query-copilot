import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('DashboardShell lazy-loading guards', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/dashboard/DashboardShell.jsx'),
    'utf-8',
  );

  const modeLayouts = [
    'ExecBriefingLayout',
    'AnalystWorkbenchLayout',
    'LiveOpsLayout',
    'StoryLayout',
    'PitchLayout',
    'WorkbookLayout',
    'TableauClassicLayout',
    'AnalystProLayout',
    'MobileLayout',
  ];

  for (const name of modeLayouts) {
    it(`uses lazy() for ${name}`, () => {
      expect(src).not.toMatch(new RegExp(`^import\\s+${name}\\s+from`, 'm'));
      expect(src).toMatch(new RegExp(`lazy\\(\\s*\\(\\)\\s*=>\\s*import\\([^)]*${name}`));
    });
  }

  it('uses lazy() for VoiceModeSelector', () => {
    expect(src).not.toMatch(/^import\s+VoiceModeSelector\s+from/m);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\([^)]*VoiceModeSelector/);
  });

  it('uses lazy() for VoiceTranscriptOverlay', () => {
    expect(src).not.toMatch(/^import\s+VoiceTranscriptOverlay\s+from/m);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\([^)]*VoiceTranscriptOverlay/);
  });
});
