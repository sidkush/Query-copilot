// Plan TSS2 T7 — assert BoardPackLayout renders no hardcoded finance
// strings when no bindings are supplied. The preset must derive every
// finance-shaped literal from a bound tile; an empty bindings/tileData
// pair should collapse to a wireframe-free dashboard.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BoardPackLayout from '../BoardPackLayout';

const FINANCE_TERMS = [
  'MRR', 'ARR', 'NRR', 'CFO', 'Acme', 'Beta-Axion', 'Amberline', 'Waverly',
  'Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5',
  '$478K', '$2.47M', '$29.6M', '+12.4%',
  'The Quarter Was Made',
  'Three enterprise expansions',
  'Pipeline coverage',
  'Enterprise concentration',
  'Growth compounded',
];

describe('BoardPackLayout — no finance fallback content', () => {
  it('renders no finance or hardcoded wireframe strings when bindings are absent', () => {
    const { container } = render(
      <BoardPackLayout bindings={{}} tileData={{}} onSlotEdit={() => {}} />
    );
    const text = container.textContent || '';
    for (const term of FINANCE_TERMS) {
      expect(text).not.toContain(term);
    }
  });
});
