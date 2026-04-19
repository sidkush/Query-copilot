// editorialBriefLayout.test.tsx — Plan TSS2 T10.
//
// Guards that EditorialBriefLayout renders zero hardcoded magazine
// content when no bindings / tileData are supplied. Every domain-
// specific literal (ARR / MRR / NRR / Churn / Payback / LTV:CAC,
// masthead "The Quarter Was Made…", byline "M. Chen, CFO · D. Park",
// event markers, 8 fake top-account rows, recommended-next strip,
// analyst commentary) must be driven by slot bindings instead of
// baked into the component.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import EditorialBriefLayout from '../EditorialBriefLayout';

const FORBIDDEN = [
  'ARR',
  '$29.6M',
  '+8.7%',
  'NRR',
  '117%',
  '+3pp',
  'CHURN',
  '2.31%',
  'LTV:CAC',
  '4.7',
  'PAYBACK',
  '14.2MO',
  'NEW LOGOS',
  'Q3 2026 · Board Pack',
  'The Quarter Was Made',
  'M. Chen',
  'CFO',
  'D. Park',
  'Acme renewal',
  'Beta-Axion expansion',
  'Row 1',
  'Row 5',
  'Three enterprise expansions',
  'Waverly Capital',
  'Thornton Medical',
  'RECOMMENDED NEXT',
];

describe('EditorialBriefLayout — no magazine fallback content', () => {
  it('renders no hardcoded magazine strings when bindings are absent', () => {
    const { container } = render(
      <EditorialBriefLayout bindings={{}} tileData={{}} onSlotEdit={() => {}} />
    );
    const text = container.textContent || '';
    // The plan's forbidden list uses upper-case display strings that
    // may be lowercased in DOM (text-transform is CSS). Reject on
    // either literal or upper-case match.
    const upper = text.toUpperCase();
    for (const term of FORBIDDEN) {
      expect(text).not.toContain(term);
      expect(upper).not.toContain(term.toUpperCase());
    }
  });
});
