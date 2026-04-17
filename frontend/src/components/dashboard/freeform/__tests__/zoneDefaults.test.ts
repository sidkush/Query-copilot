import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INNER_PADDING,
  DEFAULT_OUTER_PADDING,
  DEFAULT_FIT_MODE,
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

  it('title shown by default for worksheet, text, webpage; hidden for blank + image', () => {
    expect(TITLE_SHOWN_BY_DEFAULT.has('worksheet')).toBe(true);
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
    expect(zoneDefaultForField(z, 'showTitle')).toBe(true);
    expect(zoneDefaultForField(z, 'showCaption')).toBe(true);
    const blank = { id: 'b1', type: 'blank', w: 0, h: 0 } as any;
    expect(zoneDefaultForField(blank, 'showTitle')).toBe(false);
    expect(zoneDefaultForField(blank, 'showCaption')).toBe(false);
  });
});
