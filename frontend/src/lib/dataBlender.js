/**
 * Data Blending — merge multiple query result sets on the frontend.
 * Performs a left-join from the primary source to each additional source
 * using a shared join key column.
 */

/**
 * Blend a primary data source with additional sources via left-join.
 *
 * @param {{ columns: string[], rows: object[] }} primary - Primary data source
 * @param {Array<{ label: string, columns: string[], rows: object[] }>} additionalSources
 * @param {string} joinKey - Column name present in all sources to join on
 * @returns {{ columns: string[], rows: object[] }}
 */
export function blendSources(primary, additionalSources, joinKey) {
  if (!primary?.columns?.length || !primary?.rows?.length || !joinKey) {
    return { columns: primary?.columns || [], rows: primary?.rows || [] };
  }

  if (!additionalSources?.length) {
    return { columns: primary.columns, rows: primary.rows };
  }

  // Build lookup indices for each additional source
  const indices = additionalSources.map((source) => {
    const map = new Map();
    for (const row of source.rows || []) {
      const key = String(row[joinKey] ?? '');
      if (!map.has(key)) map.set(key, row);
    }
    return {
      label: source.label || 'B',
      columns: (source.columns || []).filter((c) => c !== joinKey),
      map,
    };
  });

  // Build merged column list
  const mergedColumns = [...primary.columns];
  for (const idx of indices) {
    for (const col of idx.columns) {
      mergedColumns.push(`${idx.label}.${col}`);
    }
  }

  // Merge rows (left-join: all primary rows, with secondary data where matched)
  const mergedRows = primary.rows.map((primaryRow) => {
    const merged = { ...primaryRow };
    const keyValue = String(primaryRow[joinKey] ?? '');

    for (const idx of indices) {
      const match = idx.map.get(keyValue);
      for (const col of idx.columns) {
        merged[`${idx.label}.${col}`] = match ? match[col] ?? null : null;
      }
    }

    return merged;
  });

  return { columns: mergedColumns, rows: mergedRows };
}

/**
 * Find columns that appear in all data sources (for join key selection).
 *
 * @param {string[]} primaryColumns
 * @param {Array<{ columns: string[] }>} additionalSources
 * @returns {string[]}
 */
export function findCommonColumns(primaryColumns, additionalSources) {
  if (!primaryColumns?.length || !additionalSources?.length) return primaryColumns || [];

  return primaryColumns.filter((col) =>
    additionalSources.every((src) => (src.columns || []).includes(col))
  );
}
