import { describe, it, expect } from 'vitest';
import {
  getArchetypeStyles,
  getTileStyles,
  getOpsStatus,
  getChapterAccent,
} from '../../../components/dashboard/lib/archetypeStyling';

describe('archetypeStyling (SP-6)', () => {
  describe('getArchetypeStyles', () => {
    it('returns distinct background per archetype', () => {
      const briefing = getArchetypeStyles('briefing');
      const ops = getArchetypeStyles('ops');
      const story = getArchetypeStyles('story');
      expect(briefing.background).toBeDefined();
      expect(ops.background).toBe('#050508');
      expect(story.background).toBe('#FDFBF7');
      // Story is light, uses dark text
      expect(story.color).toBe('#0f172a');
      // Dark archetypes use theme CSS var
      expect(ops.color).toMatch(/var\(--text-primary/);
    });

    it('falls back to briefing when given an unknown archetype', () => {
      const unknown = getArchetypeStyles('nonexistent-mode' as unknown as string);
      const briefing = getArchetypeStyles('briefing');
      expect(unknown.background).toBe(briefing.background);
    });
  });

  describe('getTileStyles', () => {
    it('returns archetype-specific tile bg + radius', () => {
      const briefing = getTileStyles('briefing');
      const tableau = getTileStyles('tableau');
      expect(briefing.borderRadius).toBeGreaterThan(0);
      expect(tableau.borderRadius).toBe(4); // tight BI radius
      // Tableau has light border
      expect(tableau.border).toMatch(/solid/);
    });
  });

  describe('getOpsStatus', () => {
    it('maps value above critical threshold to critical tone', () => {
      const result = getOpsStatus(650, { critical: 500, warning: 200 });
      expect(result.tone).toBe('critical');
      expect(result.label).toBe('CRITICAL');
    });

    it('maps value above warning but below critical to warning tone', () => {
      const result = getOpsStatus(250, { critical: 500, warning: 200 });
      expect(result.tone).toBe('warning');
      expect(result.label).toBe('WATCH');
    });

    it('maps value below warning to healthy tone', () => {
      const result = getOpsStatus(50, { critical: 500, warning: 200 });
      expect(result.tone).toBe('healthy');
      expect(result.label).toBe('NOMINAL');
    });

    it('inverts thresholds when invert=true (higher=better metrics)', () => {
      // Uptime 99.0: warning if < 99.5, critical if < 99
      const healthy = getOpsStatus(99.9, { critical: 99, warning: 99.5 }, true);
      const watch = getOpsStatus(99.3, { critical: 99, warning: 99.5 }, true);
      const critical = getOpsStatus(98.0, { critical: 99, warning: 99.5 }, true);
      expect(healthy.tone).toBe('healthy');
      expect(watch.tone).toBe('warning');
      expect(critical.tone).toBe('critical');
    });

    it('returns unknown when value is null, undefined, or NaN', () => {
      expect(getOpsStatus(null, { critical: 500, warning: 200 }).tone).toBe('unknown');
      expect(getOpsStatus(undefined, { critical: 500, warning: 200 }).tone).toBe('unknown');
      expect(getOpsStatus('abc', { critical: 500, warning: 200 } as unknown as { critical: number; warning: number }).tone).toBe('unknown');
    });
  });

  describe('getChapterAccent', () => {
    it('returns a hex color for any non-negative integer', () => {
      expect(getChapterAccent(0)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(getChapterAccent(1)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(getChapterAccent(7)).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('cycles through the palette (modulo-indexed)', () => {
      expect(getChapterAccent(0)).toBe(getChapterAccent(5));
      expect(getChapterAccent(1)).toBe(getChapterAccent(6));
    });
  });
});
