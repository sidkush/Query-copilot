import { describe, it, expect } from 'vitest';

import {
  makeField,
  makeShelf,
  makeEncoding,
  makeCategoricalFilter,
  makeRangeFilter,
  makeRelativeDateFilter,
  makeParameter,
  makeVisualSpec,
  toJSON,
  fromJSON,
  DataType,
  FieldRole,
  AggType,
  ColumnClass,
  MarkType,
  EncodingType,
  ShelfKind,
  FilterKind,
} from '../vizSpec';

function sampleField(id = 'orders.total') {
  return makeField({
    id,
    dataType: DataType.DATA_TYPE_NUMBER,
    role: FieldRole.FIELD_ROLE_MEASURE,
    aggregation: AggType.AGG_TYPE_SUM,
    columnClass: ColumnClass.COLUMN_CLASS_DATABASE,
  });
}

describe('vizSpec builders', () => {
  it('makeField seeds all defaults explicitly', () => {
    const f = makeField({ id: 'x' });
    expect(f.id).toBe('x');
    expect(f.dataType).toBe(DataType.DATA_TYPE_UNSPECIFIED);
    expect(f.role).toBe(FieldRole.FIELD_ROLE_UNSPECIFIED);
    expect(f.semanticRole).toBe('');
    expect(f.isDisagg).toBe(false);
  });

  it('makeShelf preserves field order', () => {
    const s = makeShelf(ShelfKind.SHELF_KIND_ROW, [sampleField('a'), sampleField('b')]);
    expect(s.kind).toBe(ShelfKind.SHELF_KIND_ROW);
    expect(s.fields.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('makeEncoding carries customEncodingTypeId', () => {
    const e = makeEncoding({
      fieldEncodingId: 'e1',
      encodingType: EncodingType.ENCODING_TYPE_CUSTOM,
      field: sampleField(),
      customEncodingTypeId: 'org.askdb.sankey.v1',
    });
    expect(e.customEncodingTypeId).toBe('org.askdb.sankey.v1');
    expect(e.encodingType).toBe(EncodingType.ENCODING_TYPE_CUSTOM);
  });
});

describe('vizSpec filter builders', () => {
  it('makeCategoricalFilter produces correct discriminator', () => {
    const fs = makeCategoricalFilter({
      field: sampleField('region'),
      values: ['NY', 'CA'],
      isExcludeMode: true,
    });
    expect(fs.filterKind).toBe(FilterKind.FILTER_KIND_CATEGORICAL);
    expect(fs.categorical?.values).toEqual(['NY', 'CA']);
    expect(fs.categorical?.isExcludeMode).toBe(true);
    expect(fs.range).toBeUndefined();
    expect(fs.relativeDate).toBeUndefined();
    expect(fs.hierarchical).toBeUndefined();
  });

  it('makeRangeFilter defaults rangeNullOption to keep', () => {
    const fs = makeRangeFilter({ field: sampleField('amt'), min: 0, max: 100 });
    expect(fs.filterKind).toBe(FilterKind.FILTER_KIND_RANGE);
    expect(fs.range?.rangeNullOption).toBe('keep');
  });

  it('makeRelativeDateFilter pins all four slots', () => {
    const fs = makeRelativeDateFilter({
      field: sampleField('created_at'),
      periodType: 'days',
      dateRangeType: 'last',
      rangeN: 30,
    });
    expect(fs.filterKind).toBe(FilterKind.FILTER_KIND_RELATIVE_DATE);
    expect(fs.relativeDate?.periodType).toBe('days');
    expect(fs.relativeDate?.dateRangeType).toBe('last');
    expect(fs.relativeDate?.rangeN).toBe(30);
  });
});

describe('vizSpec parameter builder', () => {
  it('seeds all domain fields', () => {
    const p = makeParameter({
      id: 'p1',
      name: 'Year',
      dataType: DataType.DATA_TYPE_INT,
      value: '2026',
      domainKind: 'range',
      domainMin: 2020,
      domainMax: 2030,
      domainStep: 1,
    });
    expect(p.domainKind).toBe('range');
    expect(p.domainMin).toBe(2020);
    expect(p.domainMax).toBe(2030);
    expect(p.domainStep).toBe(1);
  });
});

describe('VisualSpec JSON roundtrip', () => {
  it('roundtrips a fully-populated spec', () => {
    const v = makeVisualSpec({
      sheetId: 'sheet-1',
      fields: [sampleField('a'), sampleField('b')],
      shelves: [makeShelf(ShelfKind.SHELF_KIND_COLUMN, [sampleField('a')])],
      encodings: [
        makeEncoding({
          fieldEncodingId: 'e1',
          encodingType: EncodingType.ENCODING_TYPE_COLOR,
          field: sampleField('b'),
        }),
      ],
      filters: [
        makeCategoricalFilter({ field: sampleField('region'), values: ['NY'] }),
      ],
      parameters: [
        makeParameter({
          id: 'p1',
          name: 'Year',
          dataType: DataType.DATA_TYPE_INT,
          value: '2026',
          domainKind: 'range',
          domainMin: 2020,
          domainMax: 2030,
          domainStep: 1,
        }),
      ],
      markType: MarkType.MARK_TYPE_BAR,
      isGenerativeAiWebAuthoring: true,
      domainType: 'snowflake',
    });
    const rt = fromJSON(toJSON(v));
    expect(rt).toEqual(v);
  });

  it('preserves is_generative_ai_web_authoring across JSON', () => {
    const v = makeVisualSpec({ sheetId: 's', isGenerativeAiWebAuthoring: true });
    const json = toJSON(v) as Record<string, unknown>;
    // ts-proto JSON uses camelCase by default; assert via roundtrip not field name
    // to stay resilient to codegen option tweaks.
    const rt = fromJSON(json);
    expect(rt.isGenerativeAiWebAuthoring).toBe(true);
  });

  it('empty spec roundtrips', () => {
    const v = makeVisualSpec({ sheetId: '' });
    const rt = fromJSON(toJSON(v));
    expect(rt).toEqual(v);
  });

  it('pins canonical enum tag values against Build_Tableau Appendix A', () => {
    // A.1 DataType
    expect(DataType.DATA_TYPE_BOOL).toBe(1);
    expect(DataType.DATA_TYPE_STRING).toBe(9);
    // A.4 MarkType
    expect(MarkType.MARK_TYPE_VIZ_EXTENSION).toBe(13);
    // A.5 EncodingType
    expect(EncodingType.ENCODING_TYPE_CUSTOM).toBe(10);
    // A.8 FilterType
    expect(FilterKind.FILTER_KIND_RELATIVE_DATE).toBe(4);
    // A.14 AggregationType
    expect(AggType.AGG_TYPE_TRUNC_YEAR).toBe(41);
    expect(AggType.AGG_TYPE_TRUNC_SECOND).toBe(48);
  });
});
