import { describe, it, expect } from 'vitest';
import {
  resolveFilters,
  substituteUrlTemplate,
  extractSetMembers,
} from '../lib/fieldMapping';

describe('resolveFilters', () => {
  it('single mapping maps source key to target key', () => {
    const result = resolveFilters(
      [{ source: 'Week', target: 'FilterWeek' }],
      { Week: '2026-W12', Region: 'EMEA' },
    );
    expect(result).toEqual({ FilterWeek: '2026-W12' });
  });

  it('missing source key is omitted from output', () => {
    const result = resolveFilters(
      [{ source: 'MissingField', target: 'SomeTarget' }],
      { Week: '2026-W12' },
    );
    expect(result).toEqual({});
  });

  it('empty mapping returns empty object', () => {
    const result = resolveFilters([], { Week: '2026-W12' });
    expect(result).toEqual({});
  });

  it('resolveFilters emits __setRef marker for setRef entries', () => {
    const out = resolveFilters(
      [{ setRef: 's1', target: 'Region' }],
      {},
    );
    expect(out).toEqual({ Region: { __setRef: 's1' } });
  });

  it('resolveFilters mixes source and setRef entries', () => {
    const out = resolveFilters(
      [
        { source: 'Year', target: 'Year' },
        { setRef: 's1', target: 'Region' },
      ],
      { Year: 2026 },
    );
    expect(out).toEqual({
      Year: 2026,
      Region: { __setRef: 's1' },
    });
  });
});

describe('substituteUrlTemplate', () => {
  it('replaces {AccountId} placeholder with value', () => {
    const result = substituteUrlTemplate(
      'https://crm.example.com/accounts/{AccountId}',
      { AccountId: '12345' },
    );
    expect(result).toBe('https://crm.example.com/accounts/12345');
  });

  it('URL-encodes values with spaces', () => {
    const result = substituteUrlTemplate(
      'https://crm.example.com/search?name={Name}',
      { Name: 'John Doe' },
    );
    expect(result).toBe('https://crm.example.com/search?name=John%20Doe');
  });

  it('missing key replaced with empty string', () => {
    const result = substituteUrlTemplate(
      'https://crm.example.com/accounts/{AccountId}',
      {},
    );
    expect(result).toBe('https://crm.example.com/accounts/');
  });
});

describe('extractSetMembers', () => {
  it('deduplicates values across 3 events preserving first-seen order', () => {
    const events = [
      { Category: 'Furniture', Amount: 100 },
      { Category: 'Technology', Amount: 200 },
      { Category: 'Furniture', Amount: 150 },
    ];
    const result = extractSetMembers(
      [{ source: 'Category', target: 'SetCategory' }],
      events,
    );
    expect(result).toEqual(['Furniture', 'Technology']);
  });

  it('empty mapping returns empty array', () => {
    const result = extractSetMembers([], [{ Category: 'Furniture' }]);
    expect(result).toEqual([]);
  });

  it('extractSetMembers returns [] when mapping[0] is a setRef even if mapping[1] has a valid source', () => {
    const out = extractSetMembers(
      [
        { setRef: 's1', target: 't1' },
        { source: 'x', target: 't2' },
      ],
      [{ x: 'A' }, { x: 'B' }],
    );
    expect(out).toEqual([]);
  });
});
