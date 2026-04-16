import { describe, it, expect } from 'vitest';
import { validateLinguisticModel } from '../../semantic/linguistic';
import type { LinguisticModel } from '../../semantic/linguistic';

function sampleModel(): LinguisticModel {
  return {
    version: 1,
    conn_id: 'conn-abc123',
    updated_at: '2026-04-15T00:00:00Z',
    synonyms: {
      tables: { orders: ['purchases', 'transactions'] },
      columns: { 'orders.customer_id': ['buyer', 'client'] },
      values: {},
    },
    phrasings: [
      {
        id: 'p-001',
        type: 'verb',
        template: '{customer} purchased {product}',
        entities: ['customers', 'products'],
        status: 'accepted',
      },
      {
        id: 'p-002',
        type: 'attribute',
        template: '{order} belongs to {customer}',
        entities: ['orders', 'customers'],
        joinPath: ['orders.customer_id', 'customers.id'],
        status: 'user_created',
      },
    ],
    sampleQuestions: [
      {
        id: 'sq-001',
        table: 'orders',
        question: 'How many orders were placed last month?',
        status: 'suggested',
      },
    ],
    changelog: [
      {
        ts: '2026-04-15T00:00:00Z',
        action: 'bootstrap',
        target: 'synonyms.tables',
        after: { orders: ['purchases', 'transactions'] },
      },
    ],
  };
}

describe('validateLinguisticModel', () => {
  it('accepts a well-formed model', () => {
    const result = validateLinguisticModel(sampleModel());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing version', () => {
    const model = sampleModel();
    const bad = { ...model, version: undefined } as unknown;
    const result = validateLinguisticModel(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /version/.test(e))).toBe(true);
  });

  it('rejects empty conn_id', () => {
    const model = { ...sampleModel(), conn_id: '' };
    const result = validateLinguisticModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /conn_id/.test(e))).toBe(true);
  });

  it('rejects non-object synonyms', () => {
    const model = { ...sampleModel(), synonyms: 'not-an-object' } as unknown;
    const result = validateLinguisticModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /synonyms/.test(e))).toBe(true);
  });

  it('rejects phrasing with unknown type', () => {
    const model = sampleModel();
    model.phrasings[0] = { ...model.phrasings[0]!, type: 'unknown' as never };
    const result = validateLinguisticModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /type/.test(e))).toBe(true);
  });

  it('rejects duplicate phrasing ids', () => {
    const model = sampleModel();
    model.phrasings.push({ ...model.phrasings[0]! });
    const result = validateLinguisticModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Duplicate phrasing id/.test(e))).toBe(true);
  });
});
