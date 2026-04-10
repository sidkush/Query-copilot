import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { TOKENS, CHART_PALETTES } from '../components/dashboard/tokens';
import ResultsChart from '../components/ResultsChart';
import KPICard from '../components/dashboard/KPICard';
import { api } from '../api';

function ReadOnlyTile({ tile, index, themeConfig }) {
  const isKPI = tile?.chartType === 'kpi';
  const hasData = tile?.rows?.length > 0;

  return (
    <div style={{
      background: themeConfig?.background?.tile || TOKENS.bg.elevated,
      borderRadius: 16,
      border: `1px solid ${TOKENS.border.default}`,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 200,
    }}>
      <div style={{ padding: '14px 20px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: TOKENS.text.primary }}>
          {tile?.title || 'Untitled'}
        </span>
        {tile?.subtitle && (
          <span style={{ fontSize: 12, color: TOKENS.text.muted }}>{tile.subtitle}</span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: isKPI ? 0 : '0 12px 12px' }}>
        {isKPI ? (
          <KPICard tile={tile} index={index} />
        ) : hasData ? (
          <ResultsChart
            columns={tile.columns || []}
            rows={tile.rows || []}
            embedded
            defaultChartType={tile.chartType}
            defaultPalette={tile.palette}
            defaultMeasure={tile.selectedMeasure}
            defaultMeasures={tile.activeMeasures}
            formatting={tile.visualConfig}
            dashboardPalette={themeConfig?.palette || 'default'}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: TOKENS.text.muted, fontSize: 13 }}>
            No data
          </div>
        )}
      </div>
    </div>
  );
}

export default function SharedDashboard() {
  const { token } = useParams();
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTabId, setActiveTabId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSharedDashboard(token);
        setDashboard(data);
        if (data.tabs?.length > 0) setActiveTabId(data.tabs[0].id);
      } catch (err) {
        setError(err.message || 'This link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: TOKENS.bg.base, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: TOKENS.text.muted, fontSize: 14 }}>Loading shared dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: TOKENS.bg.base, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h2 style={{ color: TOKENS.text.primary, fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Link Unavailable</h2>
          <p style={{ color: TOKENS.text.muted, fontSize: 14, maxWidth: 360 }}>{error}</p>
        </div>
      </div>
    );
  }

  const themeConfig = dashboard?.themeConfig || {};
  const activeTab = dashboard?.tabs?.find(t => t.id === activeTabId) || dashboard?.tabs?.[0];
  const sections = activeTab?.sections || [];

  const allTiles = sections.flatMap(s => s.tiles || []);

  return (
    <div style={{ minHeight: '100vh', background: TOKENS.bg.base, padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ maxWidth: 1400, margin: '0 auto 24px' }}>
        <h1 style={{ color: TOKENS.text.primary, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {dashboard?.name || 'Shared Dashboard'}
        </h1>
        <p style={{ color: TOKENS.text.muted, fontSize: 13, marginTop: 4 }}>
          Read-only shared view
        </p>
      </div>

      {/* Tab bar (if multiple tabs) */}
      {dashboard?.tabs?.length > 1 && (
        <div style={{ maxWidth: 1400, margin: '0 auto 16px', display: 'flex', gap: 4, borderBottom: `1px solid ${TOKENS.border.default}`, paddingBottom: 1 }}>
          {dashboard.tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: activeTabId === tab.id ? 600 : 400,
                color: activeTabId === tab.id ? TOKENS.accent : TOKENS.text.secondary,
                background: 'none',
                border: 'none',
                borderBottom: activeTabId === tab.id ? `2px solid ${TOKENS.accent}` : '2px solid transparent',
                cursor: 'pointer',
                transition: `all ${TOKENS.transition}`,
              }}
            >
              {tab.name || 'Tab'}
            </button>
          ))}
        </div>
      )}

      {/* Tiles */}
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {sections.map(section => (
          <div key={section.id} style={{ marginBottom: 24 }}>
            {section.name && (
              <h3 style={{ color: TOKENS.text.secondary, fontSize: 14, fontWeight: 600, marginBottom: 12, paddingLeft: 4 }}>
                {section.name}
              </h3>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
              {(section.tiles || []).map((tile, i) => (
                <ReadOnlyTile key={tile.id} tile={tile} index={i} themeConfig={themeConfig} />
              ))}
            </div>
          </div>
        ))}
        {allTiles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: TOKENS.text.muted, fontSize: 14 }}>
            This dashboard has no tiles yet.
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ maxWidth: 1400, margin: '48px auto 0', textAlign: 'center' }}>
        <span style={{ color: TOKENS.text.muted, fontSize: 12 }}>
          Powered by AskDB
        </span>
      </div>
    </div>
  );
}
