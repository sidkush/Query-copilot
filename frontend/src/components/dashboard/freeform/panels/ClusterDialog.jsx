import { useState } from 'react';
import { useStore } from '../../../../store';
import { fetchCluster } from '../../../../api';

export default function ClusterDialog() {
  const ctx = useStore((s) => s.analystProClusterDialogCtx);
  const closeDialog = useStore((s) => s.closeClusterDialogAnalystPro);
  const addCluster = useStore((s) => s.addClusterAnalystPro);

  const availableVariables = ctx?.availableVariables || [];
  const [selectedVars, setSelectedVars] = useState([]);
  const [kMode, setKMode] = useState('auto');
  const [kMin, setKMin] = useState(2);
  const [kMax, setKMax] = useState(15);
  const [manualK, setManualK] = useState(3);
  const [standardize, setStandardize] = useState(true);
  const [disaggregate, setDisaggregate] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!ctx) return null;

  const toggleVar = (v) => {
    setSelectedVars((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  const runPreview = async () => {
    setError(null);
    setBusy(true);
    try {
      const spec = {
        k: kMode === 'auto' ? 'auto' : manualK,
        k_min: kMin,
        k_max: kMax,
        variables: selectedVars,
        disaggregate,
        standardize,
        seed: 42,
      };
      const rows = ctx?.rows || [];
      const resp = await fetchCluster({ rows, spec });
      setPreview(resp.result);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!preview) return;
    const id = `cluster_${Date.now()}`;
    addCluster({
      id,
      name: `Cluster (${selectedVars.join(', ')})`,
      spec: {
        k: kMode === 'auto' ? 'auto' : manualK,
        k_min: kMin, k_max: kMax,
        variables: selectedVars,
        disaggregate, standardize, seed: 42,
      },
      result: preview,
      rowKeys: ctx?.rowKeys || [],
    });
    closeDialog();
  };

  return (
    <div role="dialog" aria-label="Cluster" className="cluster-dialog">
      <h3>Cluster</h3>

      <fieldset>
        <legend>Variables</legend>
        {availableVariables.map((v) => (
          <button
            key={v}
            type="button"
            data-selected={selectedVars.includes(v)}
            onClick={() => toggleVar(v)}
          >
            {v}
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend>Number of clusters</legend>
        <label>
          <input type="radio" name="kMode" value="auto"
                 checked={kMode === 'auto'} onChange={() => setKMode('auto')} />
          Auto
        </label>
        <label>
          <input type="radio" name="kMode" value="manual"
                 checked={kMode === 'manual'} onChange={() => setKMode('manual')} />
          Manual
        </label>
        {kMode === 'auto' ? (
          <>
            <label>k_min <input type="number" min={2} value={kMin}
                                onChange={(e) => setKMin(Number(e.target.value))} /></label>
            <label>k_max <input type="number" min={2} value={kMax}
                                onChange={(e) => setKMax(Number(e.target.value))} /></label>
          </>
        ) : (
          <label>k <input type="number" min={2} value={manualK}
                          onChange={(e) => setManualK(Number(e.target.value))} /></label>
        )}
      </fieldset>

      <label>
        <input type="checkbox" checked={standardize}
               onChange={(e) => setStandardize(e.target.checked)} />
        Standardise variables
      </label>
      <label>
        <input type="checkbox" checked={disaggregate}
               onChange={(e) => setDisaggregate(e.target.checked)} />
        Disaggregate data
      </label>

      <button type="button" onClick={runPreview} disabled={busy || selectedVars.length === 0}>
        {busy ? 'Computing…' : 'Preview'}
      </button>

      {error && <p role="alert" className="error">{error}</p>}

      {preview && (
        <div className="preview">
          <p data-testid="best-k">k = {preview.optimal_k}</p>
          <p>CH {preview.calinski_harabasz_score.toFixed(1)}</p>
          <p>F-statistic {preview.f_statistic.toFixed(2)}</p>
          <table>
            <thead><tr><th>Cluster</th><th>Marks</th></tr></thead>
            <tbody>
              {Array.from({ length: preview.optimal_k }, (_, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{preview.assignments.filter((a) => a === i).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="actions">
        <button type="button" onClick={closeDialog}>Cancel</button>
        <button type="button" onClick={save} disabled={!preview}>Save</button>
      </div>
    </div>
  );
}
