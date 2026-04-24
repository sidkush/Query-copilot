import { useEffect, useState } from "react";
import {
  Database,
  Lightning,
  CloudArrowUp,
  Graph,
  ChartLineUp,
  Sparkle,
} from "@phosphor-icons/react";
import { api } from "../api";

const SOURCES = [
  { key: "schema",              label: "Schema cache",            icon: Database },
  { key: "vizql_in_process",    label: "VizQL in-process",        icon: Lightning },
  { key: "vizql_external",      label: "VizQL external",          icon: CloudArrowUp },
  { key: "chroma_query_memory", label: "Query memory (ChromaDB)", icon: Graph },
  { key: "turbo_twin",          label: "Turbo twin",              icon: ChartLineUp },
  { key: "prompt_cache",        label: "Prompt cache",            icon: Sparkle },
];

function hitColor(value) {
  if (value == null) return "var(--text-muted)";
  if (value >= 0.7)  return "oklch(60% 0.18 145)";   // green
  if (value >= 0.4)  return "oklch(65% 0.18 85)";    // amber
  return                     "oklch(60% 0.22 25)";   // red
}

function StatTile({ label, icon: Icon, value }) {
  const pct   = value == null ? "—" : `${Math.round(value * 100)}%`;
  const color = hitColor(value);

  return (
    <article
      className="rounded-[14px] border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--surface-1, var(--bg-base))" }}
    >
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <Icon size={15} weight="regular" />
        <span>{label}</span>
      </div>
      <div
        className="text-3xl font-medium tabular-nums leading-none"
        style={{ color }}
      >
        {pct}
      </div>
      {value != null && (
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--border)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.round(value * 100)}%`, background: color }}
          />
        </div>
      )}
    </article>
  );
}

export default function CacheStatsDashboard() {
  const [stats,  setStats]  = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsData, alertsData] = await Promise.all([
          api.getCacheStats(),
          api.getOpsAlerts(),
        ]);
        setStats(statsData);
        setAlerts(alertsData.alerts ?? []);
      } catch (e) {
        setError(e.message ?? "Failed to load");
      }
    };

    load();
    const h = setInterval(load, 60_000);
    return () => clearInterval(h);
  }, []);

  if (error) {
    return (
      <div className="p-8 text-sm" style={{ color: "var(--text-muted)" }}>
        <span className="text-red-400">Error:</span> {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 text-sm" style={{ color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  return (
    <main
      className="mx-auto max-w-5xl p-8 space-y-8"
      style={{ color: "var(--text-primary)" }}
    >
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Cache stats
          {" · tenant "}
          <code
            className="text-sm rounded px-1.5 py-0.5 font-mono"
            style={{
              background: "var(--surface-2, var(--bg-elevated))",
              color: "var(--text-secondary)",
            }}
          >
            {stats.tenant_id}
          </code>
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Read-only · refreshes every 60 s
        </p>
      </header>

      {/* Cache tiles grid */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {SOURCES.map(({ key, label, icon }) => (
          <StatTile
            key={key}
            label={label}
            icon={icon}
            value={stats[key] ?? null}
          />
        ))}
      </section>

      {/* Recent alerts */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent alerts</h2>

        {alerts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No alerts in window.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[14px] border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wider border-b"
                  style={{
                    color: "var(--text-muted)",
                    borderColor: "var(--border)",
                    background: "var(--surface-1, var(--bg-base))",
                  }}
                >
                  <th className="px-4 py-2.5 font-medium">Rule</th>
                  <th className="px-4 py-2.5 font-medium">Severity</th>
                  <th className="px-4 py-2.5 font-medium tabular-nums">Observed</th>
                  <th className="px-4 py-2.5 font-medium tabular-nums">Threshold</th>
                  <th className="px-4 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 50).map((a, i) => (
                  <tr
                    key={i}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-4 py-2.5">
                      <code
                        className="text-xs rounded px-1 py-0.5"
                        style={{
                          background: "var(--surface-2, var(--bg-elevated))",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {a.rule_id}
                      </code>
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>
                      {a.severity}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {a.observed_value}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {a.threshold}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {a.timestamp}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
