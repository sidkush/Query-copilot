import { useState } from "react";
import { TOKENS } from "../dashboard/tokens";

const FONT_DISPLAY = "'Outfit', system-ui, sans-serif";
const FONT_BODY = "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif";

const TIER_STYLES = {
  Spec: { bg: "rgba(20,184,166,0.12)", color: "#14b8a6", border: "rgba(20,184,166,0.25)" },
  Code: { bg: "rgba(168,85,247,0.12)", color: "#a855f7", border: "rgba(168,85,247,0.25)" },
};

const CATEGORY_STYLES = {
  Financial: { bg: "rgba(245,158,11,0.10)", color: "#f59e0b" },
  Flow:      { bg: "rgba(6,182,212,0.10)",  color: "#06b6d4" },
  Custom:    { bg: "rgba(99,102,241,0.10)",  color: "#818cf8" },
  Community: { bg: "rgba(34,197,94,0.10)",   color: "#22c55e" },
};

function StarRating({ value, onRate }) {
  const [hovered, setHovered] = useState(null);
  const display = hovered ?? Math.round(value ?? 0);
  return (
    <span
      style={{ display: "inline-flex", gap: 2, cursor: onRate ? "pointer" : "default" }}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          onMouseEnter={() => onRate && setHovered(s)}
          onClick={() => onRate?.(s)}
          style={{
            fontSize: 12,
            lineHeight: 1,
            color: s <= display ? "#f59e0b" : "rgba(255,255,255,0.15)",
            transition: "color 120ms",
          }}
          aria-label={`${s} star`}
        >
          &#9733;
        </span>
      ))}
    </span>
  );
}

/**
 * ChartTypeGalleryCard
 *
 * Props:
 *   type       — gallery entry object from /gallery/types
 *   onInstall  — (id) => void
 *   onRate     — (id, stars) => void
 */
export default function ChartTypeGalleryCard({ type, onInstall, onRate }) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const tier = type?.tier ?? "Spec";
  const tierStyle = TIER_STYLES[tier] ?? TIER_STYLES.Spec;
  const category = type?.category ?? "Custom";
  const catStyle = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Custom;

  async function handleInstall() {
    if (installing || installed) return;
    setInstalling(true);
    try {
      await onInstall?.(type.id ?? type.type_id);
      setInstalled(true);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <article
      style={{
        background: "var(--glass-bg-card, rgba(255,255,255,0.04))",
        border: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
        borderRadius: TOKENS.radius.lg,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.45)",
        transition: `box-shadow ${TOKENS.transition}, border-color ${TOKENS.transition}`,
        fontFamily: FONT_BODY,
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
        e.currentTarget.style.boxShadow =
          "0 1px 0 rgba(255,255,255,0.06) inset, 0 14px 32px -12px rgba(0,0,0,0.55)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--glass-border, rgba(255,255,255,0.08))";
        e.currentTarget.style.boxShadow =
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.45)";
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: FONT_DISPLAY,
              color: "var(--text-primary, #e7e7ea)",
              letterSpacing: "-0.012em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {type?.name ?? "Unnamed"}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted, rgba(255,255,255,0.38))",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            by {type?.author ?? "Unknown"}
          </div>
        </div>

        {/* Tier badge */}
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: TOKENS.radius.pill,
            background: tierStyle.bg,
            color: tierStyle.color,
            border: `1px solid ${tierStyle.border}`,
            fontFamily: FONT_DISPLAY,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {tier}
        </span>
      </div>

      {/* Category badge */}
      <div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            padding: "2px 8px",
            borderRadius: TOKENS.radius.pill,
            background: catStyle.bg,
            color: catStyle.color,
            fontFamily: FONT_DISPLAY,
          }}
        >
          {category}
        </span>
      </div>

      {/* Description — 2-line clamp */}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.55,
          color: "var(--text-secondary, rgba(255,255,255,0.55))",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          flex: 1,
        }}
      >
        {type?.description ?? "No description provided."}
      </p>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Install count */}
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted, rgba(255,255,255,0.38))",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M6 1v7M3 5l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {(type?.install_count ?? 0).toLocaleString()}
          </span>

          {/* Star rating */}
          <StarRating
            value={type?.avg_rating ?? 0}
            onRate={onRate ? (stars) => onRate(type?.id ?? type?.type_id, stars) : null}
          />
        </div>

        {/* Install button */}
        <button
          onClick={handleInstall}
          disabled={installing || installed}
          style={{
            fontSize: 11,
            fontWeight: 600,
            fontFamily: FONT_DISPLAY,
            padding: "5px 14px",
            borderRadius: TOKENS.radius.pill,
            border: "none",
            cursor: installing || installed ? "default" : "pointer",
            background: installed
              ? "rgba(34,197,94,0.15)"
              : installing
              ? "rgba(37,99,235,0.25)"
              : "#2563eb",
            color: installed ? "#22c55e" : "#fff",
            transition: "background 160ms, transform 120ms",
            transform: "translateZ(0)",
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={(e) => {
            if (!installing && !installed) e.currentTarget.style.background = "#1d4ed8";
          }}
          onMouseLeave={(e) => {
            if (!installing && !installed) e.currentTarget.style.background = "#2563eb";
          }}
        >
          {installed ? "Installed" : installing ? "Installing..." : "Install"}
        </button>
      </div>
    </article>
  );
}
