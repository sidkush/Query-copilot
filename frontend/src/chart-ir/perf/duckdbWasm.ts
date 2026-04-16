/**
 * duckdbWasm.ts — client-side DuckDB-WASM for local LTTB downsampling.
 *
 * Lazy-loaded only when RSR detects network latency > threshold.
 * Uses @duckdb/duckdb-wasm which ships a ~4MB WASM bundle.
 *
 * DEPENDENCY: This module requires `@duckdb/duckdb-wasm` which is NOT yet
 * installed. Before use, run:
 *   npm install @duckdb/duckdb-wasm
 *
 * The dynamic import() below keeps the ~4MB WASM bundle out of the main
 * chunk — it is only fetched when localLttbDownsample() is first called.
 */

let _db: any = null;
let _loading: Promise<any> | null = null;

export async function initDuckDBWasm(): Promise<any> {
  if (_db) return _db;
  if (_loading) return _loading;

  _loading = (async () => {
    // Dynamic import to avoid bundling 4MB WASM in the main chunk.
    // The variable indirection prevents Vite from statically analyzing
    // and failing on the missing package during dev/test.
    const pkg = '@duckdb/duckdb-wasm';
    const duckdb = await import(/* @vite-ignore */ pkg);
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    _db = db;
    return db;
  })();

  return _loading;
}

export async function localLttbDownsample(
  rows: Record<string, unknown>[],
  xField: string,
  yField: string,
  targetPoints: number,
): Promise<Record<string, unknown>[]> {
  const db = await initDuckDBWasm();
  const conn = await db.connect();

  try {
    // Create temp table from rows
    const columns = Object.keys(rows[0] || {});
    const createSql = `CREATE TEMP TABLE _data (${columns.map(c => `"${c}" VARCHAR`).join(', ')})`;
    await conn.query(createSql);

    // Insert rows (batch via INSERT VALUES)
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = batch
        .map(
          r =>
            `(${columns
              .map(c => {
                const v = r[c];
                return v === null || v === undefined
                  ? 'NULL'
                  : `'${String(v).replace(/'/g, "''")}'`;
              })
              .join(',')})`,
        )
        .join(',');
      await conn.query(`INSERT INTO _data VALUES ${values}`);
    }

    // Run LTTB via NTILE bucketing (same approach as backend chart_downsampler.lttb_sql)
    const lttbSql = `
      WITH _numbered AS (
        SELECT CAST("${xField}" AS DOUBLE) AS x_num, CAST("${yField}" AS DOUBLE) AS y_num,
               ROW_NUMBER() OVER (ORDER BY "${xField}") AS rn,
               COUNT(*) OVER () AS total
        FROM _data
      ),
      _sampled AS (
        SELECT *, NTILE(${targetPoints}) OVER (ORDER BY rn) AS bucket
        FROM _numbered
      ),
      _picked AS (
        SELECT x_num, y_num, bucket,
               ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY y_num DESC) AS r
        FROM _sampled
      )
      SELECT x_num AS "${xField}", y_num AS "${yField}"
      FROM _picked WHERE r = 1
      ORDER BY bucket
    `;

    const result = await conn.query(lttbSql);
    const output: Record<string, unknown>[] = [];
    for (let i = 0; i < result.numRows; i++) {
      const row: Record<string, unknown> = {};
      for (const col of [xField, yField]) {
        row[col] = result
          .getChildAt(result.schema.fields.findIndex((f: { name: string }) => f.name === col))
          ?.get(i);
      }
      output.push(row);
    }

    return output;
  } finally {
    await conn.query('DROP TABLE IF EXISTS _data');
    await conn.close();
  }
}

export function isDuckDBWasmAvailable(): boolean {
  return typeof WebAssembly !== 'undefined';
}
