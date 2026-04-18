import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INNER_PADDING,
  DEFAULT_OUTER_PADDING,
  DEFAULT_FIT_MODE,
  TITLE_BAR_DEFAULT_VISIBLE,
  TITLE_SHOWN_BY_DEFAULT,
  CAPTION_SHOWN_BY_DEFAULT,
  zoneDefaultForField,
} from '../lib/zoneDefaults';

describe('zoneDefaults (Plan 5d)', () => {
  it('scalar defaults match roadmap', () => {
    expect(DEFAULT_INNER_PADDING).toBe(4);
    expect(DEFAULT_OUTER_PADDING).toBe(0);
    expect(DEFAULT_FIT_MODE).toBe('fit');
  });

  it('title shown by default for text, webpage; hidden for worksheet (Plan 7 T1), blank + image', () => {
    // Plan 7 T1: worksheet no longer shows a frame title bar by default.
    // The Vega chart owns its own title; the frame chrome double-titled the tile.
    expect(TITLE_SHOWN_BY_DEFAULT.has('worksheet')).toBe(false);
    expect(TITLE_SHOWN_BY_DEFAULT.has('text')).toBe(true);
    expect(TITLE_SHOWN_BY_DEFAULT.has('webpage')).toBe(true);
    expect(TITLE_SHOWN_BY_DEFAULT.has('blank')).toBe(false);
    expect(TITLE_SHOWN_BY_DEFAULT.has('image')).toBe(false);
  });

  it('caption shown by default only for worksheet', () => {
    expect(CAPTION_SHOWN_BY_DEFAULT.has('worksheet')).toBe(true);
    expect(CAPTION_SHOWN_BY_DEFAULT.has('text')).toBe(false);
    expect(CAPTION_SHOWN_BY_DEFAULT.has('blank')).toBe(false);
  });

  it('zoneDefaultForField returns the right default per field', () => {
    const z = { id: 'z1', type: 'worksheet', w: 0, h: 0 } as any;
    expect(zoneDefaultForField(z, 'innerPadding')).toBe(4);
    expect(zoneDefaultForField(z, 'outerPadding')).toBe(0);
    expect(zoneDefaultForField(z, 'fitMode')).toBe('fit');
    // Plan 7 T1: worksheet defaults to NO frame title.
    expect(zoneDefaultForField(z, 'showTitle')).toBe(false);
    expect(zoneDefaultForField(z, 'showCaption')).toBe(true);
    const blank = { id: 'b1', type: 'blank', w: 0, h: 0 } as any;
    expect(zoneDefaultForField(blank, 'showTitle')).toBe(false);
    expect(zoneDefaultForField(blank, 'showCaption')).toBe(false);
  });
});

describe('Plan 7 T1 — worksheet frame-bar default', () => {
  it('worksheet NOT in TITLE_BAR_DEFAULT_VISIBLE (chart owns its title, not frame chrome)', () => {
    expect(TITLE_BAR_DEFAULT_VISIBLE.has('worksheet')).toBe(false);
  });

  it('worksheet NOT in TITLE_SHOWN_BY_DEFAULT (alias set must stay in sync)', () => {
    expect(TITLE_SHOWN_BY_DEFAULT.has('worksheet')).toBe(false);
  });

  it('other leaf types keep their defaults (regression guard)', () => {
    expect(TITLE_BAR_DEFAULT_VISIBLE.has('text')).toBe(true);
    expect(TITLE_BAR_DEFAULT_VISIBLE.has('webpage')).toBe(true);
    expect(TITLE_BAR_DEFAULT_VISIBLE.has('filter')).toBe(true);
    expect(TITLE_BAR_DEFAULT_VISIBLE.has('legend')).toBe(true);
  });
});
