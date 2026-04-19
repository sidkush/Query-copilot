import { describe, it, expect } from 'vitest';
import { PRESET_SLOTS, getSlotsForPreset, getSlotDescriptor } from '../slots';

describe('preset slot registry', () => {
  it('declares every themed preset', () => {
    expect(Object.keys(PRESET_SLOTS).sort()).toEqual([
      'analyst-pro',
      'board-pack',
      'editorial-brief',
      'operator-console',
      'signal',
    ]);
  });

  it('analyst-pro has no slot manifest (freeform flow)', () => {
    expect(getSlotsForPreset('analyst-pro')).toEqual([]);
  });

  it('themed presets carry the expected slot counts', () => {
    expect(getSlotsForPreset('board-pack')).toHaveLength(19);
    expect(getSlotsForPreset('operator-console')).toHaveLength(10);
    expect(getSlotsForPreset('signal')).toHaveLength(11);
    expect(getSlotsForPreset('editorial-brief')).toHaveLength(18);
  });

  it('every slot descriptor has id / kind / label / hint / fallback', () => {
    for (const presetId of ['board-pack', 'operator-console', 'signal', 'editorial-brief'] as const) {
      for (const slot of getSlotsForPreset(presetId)) {
        expect(slot.id).toMatch(/^[a-z-]+\.[a-z0-9-]+$/);
        expect(['kpi', 'chart', 'table', 'narrative']).toContain(slot.kind);
        expect(slot.label).toBeTruthy();
        expect(slot.hint).toBeTruthy();
        expect(slot.fallback).toBeDefined();
      }
    }
  });

  it('getSlotDescriptor returns the matching slot or undefined', () => {
    const hero = getSlotDescriptor('board-pack', 'bp.hero-number');
    expect(hero?.kind).toBe('kpi');
    expect(getSlotDescriptor('board-pack', 'made-up-id')).toBeUndefined();
    expect(getSlotDescriptor('unknown-preset', 'bp.hero-number')).toBeUndefined();
  });

  it('unknown preset falls through to empty', () => {
    expect(getSlotsForPreset('unknown-preset')).toEqual([]);
  });
});

describe('slot manifest additions for connection-aware presets', () => {
  it('board-pack exposes kicker + topbar slots', () => {
    const ids = getSlotsForPreset('board-pack').map(s => s.id);
    expect(ids).toContain('bp.kicker');
    for (const i of [0, 1, 2, 3, 4, 5]) {
      expect(ids).toContain(`bp.topbar-${i}`);
    }
  });

  it('editorial-brief exposes kicker + topbar slots', () => {
    const ids = getSlotsForPreset('editorial-brief').map(s => s.id);
    expect(ids).toContain('eb.kicker');
    for (const i of [0, 1, 2, 3, 4, 5]) {
      expect(ids).toContain(`eb.topbar-${i}`);
    }
  });

  it('operator-console exposes footer + metadata slots', () => {
    const ids = getSlotsForPreset('operator-console').map(s => s.id);
    expect(ids).toContain('oc.footer');
    expect(ids).toContain('oc.metadata');
  });

  it('signal exposes legend slots', () => {
    const ids = getSlotsForPreset('signal').map(s => s.id);
    for (const i of [0, 1, 2, 3]) {
      expect(ids).toContain(`sg.legend-${i}`);
    }
  });
});
