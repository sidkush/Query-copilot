/**
 * Typed-Seeking-Spring Phase 4 / Wave 2-B — TDD red suite for Slot.jsx.
 *
 * The Slot wrapper is the universal hover-to-edit, binding-aware
 * container every preset layout uses. These tests nail its four-state
 * contract (bound / fallback / loading / unresolved), the edit
 * affordance toggling, and keyboard accessibility.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Slot from '../Slot.jsx';

describe('Slot — universal binding wrapper', () => {
  it('emits a data-slot + data-testid anchor every time', () => {
    render(
      <Slot id="bp.hero-number" presetId="board-pack" editable>
        {() => <div data-testid="child" />}
      </Slot>
    );
    const anchor = screen.getByTestId('slot-bp.hero-number');
    expect(anchor.getAttribute('data-slot')).toBe('bp.hero-number');
  });

  it('renders the fallback when no binding is present', () => {
    render(
      <Slot
        id="bp.hero-number"
        presetId="board-pack"
        editable
        bindings={undefined}
        tileData={undefined}
      >
        {(ctx) => (
          <div data-testid="rendered">
            {ctx.state}:{JSON.stringify(ctx.value)}
          </div>
        )}
      </Slot>
    );
    const out = screen.getByTestId('rendered').textContent ?? '';
    expect(out).toContain('fallback');
    // Plan TSS2 T7-T10 purge: bp.hero-number descriptor fallback is now
    // { value: '—', delta: null, label: '—' } — no finance-flavored copy.
    expect(out).toContain('\u2014');
  });

  it('state=unresolved when descriptor is unknown', () => {
    render(
      <Slot id="nope.not-a-slot" presetId="board-pack" editable>
        {(ctx) => <div data-testid="rendered">{ctx.state}</div>}
      </Slot>
    );
    expect(screen.getByTestId('rendered').textContent).toBe('unresolved');
  });

  it('fires onEdit with slotId + anchor on click when editable', () => {
    const onEdit = vi.fn();
    render(
      <Slot
        id="bp.hero-number"
        presetId="board-pack"
        editable
        onEdit={onEdit}
        bindings={{}}
        tileData={{}}
      >
        {() => <div />}
      </Slot>
    );
    fireEvent.click(screen.getByTestId('slot-bp.hero-number'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0][0]).toBe('bp.hero-number');
    expect(onEdit.mock.calls[0][1]).toBeInstanceOf(HTMLElement);
  });

  it('suppresses edit affordance when editable=false', () => {
    const onEdit = vi.fn();
    render(
      <Slot
        id="bp.hero-number"
        presetId="board-pack"
        editable={false}
        onEdit={onEdit}
      >
        {() => <div />}
      </Slot>
    );
    fireEvent.click(screen.getByTestId('slot-bp.hero-number'));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('adds slot--hover class on mouse enter and removes on leave when editable', () => {
    render(
      <Slot id="bp.hero-number" presetId="board-pack" editable>
        {() => <div />}
      </Slot>
    );
    const el = screen.getByTestId('slot-bp.hero-number');
    expect(el.className).not.toMatch(/slot--hover/);
    fireEvent.mouseEnter(el);
    expect(el.className).toMatch(/slot--hover/);
    fireEvent.mouseLeave(el);
    expect(el.className).not.toMatch(/slot--hover/);
  });

  it('does not add slot--hover class when editable=false', () => {
    render(
      <Slot id="bp.hero-number" presetId="board-pack" editable={false}>
        {() => <div />}
      </Slot>
    );
    const el = screen.getByTestId('slot-bp.hero-number');
    fireEvent.mouseEnter(el);
    expect(el.className).not.toMatch(/slot--hover/);
  });

  it('triggers edit on keyboard Enter + Space when editable', () => {
    const onEdit = vi.fn();
    render(
      <Slot id="bp.hero-number" presetId="board-pack" editable onEdit={onEdit}>
        {() => <div />}
      </Slot>
    );
    const el = screen.getByTestId('slot-bp.hero-number');
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(el, { key: ' ' });
    expect(onEdit).toHaveBeenCalledTimes(2);
    // Irrelevant keys must not fire.
    fireEvent.keyDown(el, { key: 'a' });
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it('resolves the live value when a binding + tileData are supplied', () => {
    const bindings = {
      'bp.hero-number': {
        slotId: 'bp.hero-number',
        tileId: 't1',
        kind: 'kpi',
        measure: { column: 'revenue', agg: 'SUM' },
        isUserPinned: false,
      },
    };
    const tileData = { t1: { columns: ['value'], rows: [{ value: 290000 }] } };
    render(
      <Slot
        id="bp.hero-number"
        presetId="board-pack"
        editable
        bindings={bindings}
        tileData={tileData}
      >
        {(ctx) => (
          <div data-testid="rendered">
            {ctx.state}:{JSON.stringify(ctx.value)}
          </div>
        )}
      </Slot>
    );
    const text = screen.getByTestId('rendered').textContent ?? '';
    expect(text.startsWith('bound:')).toBe(true);
  });

  it('state=loading when a binding exists but tileData is missing', () => {
    const bindings = {
      'bp.hero-number': {
        slotId: 'bp.hero-number',
        tileId: 't1',
        kind: 'kpi',
        isUserPinned: false,
      },
    };
    render(
      <Slot
        id="bp.hero-number"
        presetId="board-pack"
        editable
        bindings={bindings}
        tileData={{}}
      >
        {(ctx) => <div data-testid="rendered">{ctx.state}</div>}
      </Slot>
    );
    expect(screen.getByTestId('rendered').textContent).toBe('loading');
  });

  it('passes the binding object through to the children render ctx', () => {
    const binding = {
      slotId: 'bp.hero-number',
      tileId: 't1',
      kind: 'kpi',
      isUserPinned: false,
    };
    render(
      <Slot
        id="bp.hero-number"
        presetId="board-pack"
        editable
        bindings={{ 'bp.hero-number': binding }}
        tileData={{ t1: { columns: ['v'], rows: [{ v: 1 }] } }}
      >
        {(ctx) => (
          <div data-testid="rendered">{ctx.binding ? 'yes' : 'no'}</div>
        )}
      </Slot>
    );
    expect(screen.getByTestId('rendered').textContent).toBe('yes');
  });

  it('still renders the slot anchor when children throw no content', () => {
    render(
      <Slot id="bp.hero-number" presetId="board-pack" editable>
        {() => null}
      </Slot>
    );
    expect(screen.getByTestId('slot-bp.hero-number')).toBeTruthy();
  });
});
