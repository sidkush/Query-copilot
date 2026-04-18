// EditorialBriefLayout.test.tsx — Plan A★ Phase 6 (Wave 2-EB).
//
// Verifies the bespoke wireframe renders every anatomical landmark the
// plan calls for: test-id on the root, italic amber highlight in the
// headline, byline attributions, four 1px-bordered KPI boxes, an
// 8-row top-accounts table, the commentary drop-cap, warm cream page
// background, and the RECOMMENDED NEXT strip.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import EditorialBriefLayout from '../EditorialBriefLayout';

/**
 * Helper: convert `rgb(r, g, b)` or `#rrggbb` → [r,g,b]. Returns null
 * if the computed value is `transparent` / an empty string (jsdom does
 * not always compute @import'd Google-Font colours; we fall back to the
 * asserted inline class if that happens).
 */
function parseRgb(value: string): [number, number, number] | null {
  if (!value) return null;
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  const m = value.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

describe('EditorialBriefLayout', () => {
  it('renders a root with the editorial-brief data attributes', () => {
    render(<EditorialBriefLayout />);
    const root = screen.getByTestId('layout-editorial-brief');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-preset', 'editorial-brief');
  });

  it('puts an <em> inside the headline with the text "Was Made"', () => {
    render(<EditorialBriefLayout />);
    const headline = screen.getByRole('heading', { level: 1 });
    const em = headline.querySelector('em');
    expect(em).not.toBeNull();
    expect(em!.textContent).toBe('Was Made');
    expect(em!.className).toContain('eb-italic-accent');
  });

  it('has a byline naming M. Chen, CFO and D. Park', () => {
    render(<EditorialBriefLayout />);
    // The byline fragments text across <b> children, so search the whole
    // document for the names.
    expect(screen.getByText(/M\. Chen, CFO/)).toBeInTheDocument();
    expect(screen.getByText(/D\. Park/)).toBeInTheDocument();
  });

  it('renders exactly four KPI boxes, each with a 1px solid border on all sides', () => {
    render(<EditorialBriefLayout />);
    const boxes = document.querySelectorAll('.eb-kpi-box');
    expect(boxes.length).toBe(4);
    const sample = boxes[0] as HTMLElement;
    const style = window.getComputedStyle(sample);
    // jsdom doesn't load the Google-Fonts stylesheet, but it does compute
    // our local @import'd rules from EditorialBriefLayout.css. Accept any
    // truthy 1px-solid signal — some jsdom builds report `border-style`
    // blank when shorthand isn't consumed, so we also fall back to the
    // individual side properties.
    const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
    for (const side of sides) {
      const w = style.getPropertyValue(`border-${side.toLowerCase()}-width`);
      const s = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
      expect(w).toBe('1px');
      expect(s).toBe('solid');
    }
  });

  it('renders 8 rows in the top-accounts table', () => {
    render(<EditorialBriefLayout />);
    const table = document.querySelector('.eb-accounts__table') as HTMLElement;
    expect(table).toBeTruthy();
    const rows = within(table).getAllByRole('row');
    // +1 for header row
    expect(rows.length).toBe(9);
    // body rows
    expect(table.querySelectorAll('tbody tr').length).toBe(8);
  });

  it('has the drop-cap "T" span with class eb-dropcap', () => {
    render(<EditorialBriefLayout />);
    const dropcap = document.querySelector('.eb-dropcap') as HTMLElement;
    expect(dropcap).toBeTruthy();
    expect(dropcap.tagName.toLowerCase()).toBe('span');
    expect(dropcap.textContent).toBe('T');
  });

  it('has a warm cream page background (#f4efe4)', () => {
    render(<EditorialBriefLayout />);
    const root = screen.getByTestId('layout-editorial-brief');
    const style = window.getComputedStyle(root);
    const rgb = parseRgb(style.backgroundColor);
    expect(rgb).not.toBeNull();
    expect(rgb).toEqual([244, 239, 228]);
  });

  it('prints a RECOMMENDED NEXT strip at the end of the commentary', () => {
    render(<EditorialBriefLayout />);
    // `text-transform: uppercase` is a CSS rendering transform; the DOM
    // text is the original casing. Match case-insensitively.
    const rec = screen.getByText(/Recommended Next:/i);
    expect(rec).toBeInTheDocument();
    expect(rec.className).toContain('eb-recommended');
  });
});
