import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../../api";
import { TOKENS } from "../dashboard/tokens";
import ChartTypeGalleryCard from "./ChartTypeGalleryCard";

const FONT_DISPLAY = "'Outfit', system-ui, sans-serif";
const FONT_BODY = "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif";

const CATEGORIES = ["All", "Financial", "Flow", "Custom", "Community"];
const TIERS = ["All", "Spec", "Code"];
const SORT_OPTIONS = [
  { value: "recent",    label: "Recent" },
  { value: "popular",  label: "Popular" },
  { value: "top_rated", label: "Top Rated" },
];
const PAGE_SIZE = 12;

/* ── Toast ── */
function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: { bg: "rgba(34,197,94,0.14)", border: "rgba(34,197,94,0.28)", text: "#22c55e" },
    error:   { bg: "rgba(239,68,68,0.14)",  border: "rgba(239,68,68,0.28)",  text: "#ef4444" },
  };
  const c = colors[type] ?? colors.success;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        zIndex: 9999,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: TOKENS.radius.md,
        padding: "11px 20px",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: FONT_DISPLAY,
        color: c.text,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        animation: "askdb-fadein 200ms ease",
      }}
    >
      {type === "success" ? "✓" : "✗"} {message}
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: c.text,
          fontSize: 14,
          lineHeight: 1,
          padding: "0 2px",
          opacity: 0.7,
        }}
      >
        ×
      </button>
    </div>
  );
}

/* ── Filter chip ── */
function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        fontFamily: FONT_DISPLAY,
        padding: "5px 13px",
        borderRadius: TOKENS.radius.pill,
        border: `1px solid ${active ? "rgba(37,99,235,0.5)" : "rgba(255,255,255,0.10)"}`,
        background: active ? "rgba(37,99,235,0.18)" : "rgba(255,255,255,0.04)",
        color: active ? "#93c5fd" : "var(--text-secondary, rgba(255,255,255,0.55))",
        cursor: "pointer",
        transition: "all 150ms",
        whiteSpace: "nowrap",
        letterSpacing: "-0.01em",
      }}
    >
      {label}
    </button>
  );
}

/* ── Empty state ── */
function EmptyState({ query }) {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "72px 24px",
        gap: 12,
        color: "var(--text-muted, rgba(255,255,255,0.35))",
        fontFamily: FONT_BODY,
      }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="6" y="6" width="28" height="28" rx="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3"/>
        <path d="M14 20h12M20 14v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: FONT_DISPLAY, color: "var(--text-secondary)" }}>
        {query ? `No results for "${query}"` : "No chart types found"}
      </div>
      <div style={{ fontSize: 12 }}>Try adjusting your filters or check back later.</div>
    </div>
  );
}

/* ── Skeleton card ── */
function SkeletonCard() {
  return (
    <div
      style={{
        background: "var(--glass-bg-card, rgba(255,255,255,0.03))",
        border: "1px solid var(--glass-border, rgba(255,255,255,0.07))",
        borderRadius: TOKENS.radius.lg,
        padding: 16,
        height: 190,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {[60, 20, 80, 50].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 18 : 12,
            width: `${w}%`,
            borderRadius: 4,
            background: "rgba(255,255,255,0.06)",
            animation: "askdb-pulse 1.4s ease infinite",
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * ChartTypeGallery — main community gallery component.
 * Fetches from /gallery/types, provides search/filter/sort/pagination + install flow.
 */
export default function ChartTypeGallery() {
  const [allTypes, setAllTypes]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [search, setSearch]       = useState("");
  const [category, setCategory]   = useState("All");
  const [tier, setTier]           = useState("All");
  const [sort, setSort]           = useState("recent");
  const [page, setPage]           = useState(1);

  const [toast, setToast]         = useState(null); // { message, type }

  /* ── Fetch gallery on mount ── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listGalleryTypes()
      .then((data) => {
        if (!cancelled) {
          setAllTypes(Array.isArray(data) ? data : (data?.items ?? []));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load gallery");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  /* ── Client-side filter + sort ── */
  const filtered = useMemo(() => {
    let items = allTypes;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (t) =>
          (t.name ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.author ?? "").toLowerCase().includes(q)
      );
    }

    if (category !== "All") {
      items = items.filter((t) => (t.category ?? "") === category);
    }

    if (tier !== "All") {
      items = items.filter((t) => (t.tier ?? "") === tier);
    }

    if (sort === "popular") {
      items = [...items].sort((a, b) => (b.install_count ?? 0) - (a.install_count ?? 0));
    } else if (sort === "top_rated") {
      items = [...items].sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0));
    } else {
      // recent — sort by created_at desc (fallback: keep API order)
      items = [...items].sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at) : 0;
        const db = b.created_at ? new Date(b.created_at) : 0;
        return db - da;
      });
    }

    return items;
  }, [allTypes, search, category, tier, sort]);

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, category, tier, sort]);

  /* ── Install ── */
  const handleInstall = useCallback(async (id) => {
    try {
      await api.installFromGallery(id);
      setToast({ message: "Chart type installed successfully.", type: "success" });
    } catch (err) {
      setToast({ message: err.message ?? "Install failed", type: "error" });
      throw err; // re-throw so card can reset its state
    }
  }, []);

  /* ── Rate ── */
  const handleRate = useCallback(async (id, stars) => {
    try {
      await api.rateGalleryType(id, stars);
      // Optimistically update local avg_rating
      setAllTypes((prev) =>
        prev.map((t) => ((t.id ?? t.type_id) === id ? { ...t, avg_rating: stars } : t))
      );
    } catch {
      // Silent — rating is non-critical
    }
  }, []);

  return (
    <div
      style={{
        padding: "28px 32px",
        maxWidth: 1200,
        margin: "0 auto",
        minHeight: "100%",
        fontFamily: FONT_BODY,
        boxSizing: "border-box",
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: "0 0 4px",
            fontSize: 22,
            fontWeight: 800,
            fontFamily: FONT_DISPLAY,
            color: "var(--text-primary, #e7e7ea)",
            letterSpacing: "-0.022em",
          }}
        >
          Chart Gallery
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted, rgba(255,255,255,0.38))" }}>
          Browse and install community chart types. One click to add to your library.
        </p>
      </div>

      {/* Controls bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20, alignItems: "center" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200, maxWidth: 320 }}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          >
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search chart types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 12px 8px 32px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: TOKENS.radius.md,
              color: "var(--text-primary, #e7e7ea)",
              fontSize: 12.5,
              fontFamily: FONT_BODY,
              outline: "none",
              transition: "border-color 150ms",
            }}
            onFocus={(e) => { e.target.style.borderColor = "rgba(37,99,235,0.5)"; }}
            onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.09)"; }}
          />
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{
            padding: "8px 12px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: TOKENS.radius.md,
            color: "var(--text-secondary, rgba(255,255,255,0.65))",
            fontSize: 12.5,
            fontFamily: FONT_DISPLAY,
            cursor: "pointer",
            outline: "none",
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Category chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
        ))}
        <span style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)", margin: "0 4px", alignSelf: "center" }} />
        {TIERS.map((t) => (
          <Chip key={t} label={t} active={tier === t} onClick={() => setTier(t)} />
        ))}
      </div>

      {/* Result count */}
      {!loading && !error && (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16, fontFamily: FONT_DISPLAY }}>
          {filtered.length} {filtered.length === 1 ? "result" : "results"}
          {search && ` for "${search}"`}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "20px 24px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.18)",
            borderRadius: TOKENS.radius.md,
            color: "#f87171",
            fontSize: 13,
            fontFamily: FONT_BODY,
            marginBottom: 20,
          }}
        >
          Failed to load gallery: {error}
        </div>
      )}

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : pageItems.length === 0
          ? <EmptyState query={search} />
          : pageItems.map((type) => (
              <ChartTypeGalleryCard
                key={type.id ?? type.type_id}
                type={type}
                onInstall={handleInstall}
                onRate={handleRate}
              />
            ))}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <button
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              padding: "7px 18px",
              borderRadius: TOKENS.radius.md,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: safePage <= 1 ? "rgba(255,255,255,0.2)" : "var(--text-secondary)",
              fontSize: 12.5,
              fontFamily: FONT_DISPLAY,
              cursor: safePage <= 1 ? "default" : "pointer",
              transition: "all 150ms",
            }}
            onMouseEnter={(e) => { if (safePage > 1) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          >
            Previous
          </button>

          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: FONT_DISPLAY }}>
            Page {safePage} of {totalPages}
          </span>

          <button
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{
              padding: "7px 18px",
              borderRadius: TOKENS.radius.md,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: safePage >= totalPages ? "rgba(255,255,255,0.2)" : "var(--text-secondary)",
              fontSize: 12.5,
              fontFamily: FONT_DISPLAY,
              cursor: safePage >= totalPages ? "default" : "pointer",
              transition: "all 150ms",
            }}
            onMouseEnter={(e) => { if (safePage < totalPages) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          >
            Next
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes askdb-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes askdb-pulse  { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
      `}</style>
    </div>
  );
}
