/**
 * Plan A★ Phase 3 / Wave 2-BP — TDD red suite.
 *
 * Asserts BoardPackLayout renders wireframe 1 (cream tearsheet) verbatim:
 * cream background, big +$478K hero number, five-row KPI list, top-accounts
 * sidebar, three-column bottom strip. Stub currently mounts an empty div, so
 * these go red until the bespoke layout lands.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import BoardPackLayout from '../BoardPackLayout';

describe('BoardPackLayout — wireframe 1 contract', () => {
  it('root carries the layout testid + preset dataset flag', () => {
    const { container } = render(<BoardPackLayout />);
    const root = container.querySelector('[data-testid="layout-board-pack"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-preset')).toBe('board-pack');
  });

  it('hero number reads "+$478K"', () => {
    render(<BoardPackLayout />);
    const hero = screen.getByTestId('board-pack-hero-number');
    // Number + unit may be split across spans; textContent collapses them.
    expect(hero.textContent?.replace(/\s+/g, '')).toBe('+$478K');
  });

  it('top bar shows the Q3 REVENUE · BOARD PACK kicker', () => {
    render(<BoardPackLayout />);
    // Normalize NBSP / whitespace for the middle-dot separator.
    const match = screen.getByText((_, node) => {
      const text = node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return text === 'Q3 REVENUE · BOARD PACK';
    });
    expect(match).toBeTruthy();
  });

  it('renders exactly five KPI rows inside the hero KPI list', () => {
    render(<BoardPackLayout />);
    const list = screen.getByTestId('board-pack-kpi-list');
    const rows = list.querySelectorAll('.bp-kpi');
    expect(rows).toHaveLength(5);
  });

  it('renders exactly five top-accounts rows (by account name presence)', () => {
    render(<BoardPackLayout />);
    const accounts = screen.getByTestId('board-pack-accounts');
    expect(within(accounts).getByText('Amberline Logistics')).toBeInTheDocument();
    expect(within(accounts).getByText('Northfield Biotech')).toBeInTheDocument();
    expect(within(accounts).getByText('Waverly Capital')).toBeInTheDocument();
    expect(within(accounts).getByText('Kestrel Aerospace')).toBeInTheDocument();
    expect(within(accounts).getByText('Ordinance Retail')).toBeInTheDocument();
  });

  it('bottom strip has three cards', () => {
    render(<BoardPackLayout />);
    const strip = screen.getByTestId('board-pack-bottom-strip');
    const cards = strip.querySelectorAll('.bp-strip__card');
    expect(cards).toHaveLength(3);
  });

  it('root background color resolves to cream rgb(245, 241, 232)', () => {
    const { container } = render(<BoardPackLayout />);
    const root = container.querySelector<HTMLElement>('[data-testid="layout-board-pack"]');
    expect(root).not.toBeNull();
    // jsdom does not apply external stylesheets via <link>, but inline-style
    // background is observable through the element's style property. The
    // layout sets background as an inline style so the cream invariant is
    // testable without a real CSSOM.
    expect(root?.style.backgroundColor).toBe('rgb(245, 241, 232)');
  });
});
