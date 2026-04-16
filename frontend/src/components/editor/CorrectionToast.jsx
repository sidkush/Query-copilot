import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../../store";
import { api } from "../../api";

/* ─────────────────────────────────────────────────────────────────────────
 * CorrectionToast — D3 Task 2
 *
 * Non-blocking teach-by-correction toast. Reads the first item from the
 * `correctionSuggestions` queue in the Zustand store and renders it as a
 * dark-glass card anchored to the bottom-right of the editor container.
 *
 * Auto-dismisses after 8 s with an animated shrink progress bar.
 * Accept behaviour is type-specific:
 *   synonym       → patch column synonyms in the linguistic model, persist
 *   color_map     → add domain/range entries to color map, persist
 *   measure_default → dismiss-only (full impl deferred to D4)
 *
 * Props
 *   connId  string  active connection id (used for API persist calls)
 * ──────────────────────────────────────────────────────────────────────── */

const AUTO_DISMISS_MS = 8000;

// ── Style constants ────────────────────────────────────────────────────────

const S = {
  container: {
    position: "absolute",
    bottom: 64,
    right: 16,
    width: 360,
    zIndex: 60,
    pointerEvents: "all",
  },
  card: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(30,30,50,0.95)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow:
      "0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    animation: "ct-slide-in 0.22s cubic-bezier(0.16,1,0.3,1) both",
  },
  body: {
    padding: "14px 16px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(167,139,250,0.9)",
    marginBottom: 2,
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  eyebrowDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "rgba(167,139,250,0.85)",
    flexShrink: 0,
  },
  message: {
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.45,
    color: "var(--text-primary, #ededef)",
    margin: 0,
  },
  subtitle: {
    fontSize: 11.5,
    lineHeight: 1.55,
    color: "var(--text-muted, #6b7280)",
    margin: 0,
    marginTop: 2,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 7,
    padding: "8px 12px 10px",
  },
  dismissBtn: {
    padding: "5px 13px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "var(--text-muted, #6b7280)",
    cursor: "pointer",
    transition: "all 0.15s",
    letterSpacing: "0.01em",
  },
  acceptBtn: {
    padding: "5px 15px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 7,
    border: "none",
    background: "var(--accent, #2563eb)",
    color: "#fff",
    cursor: "pointer",
    transition: "all 0.15s",
    letterSpacing: "0.01em",
    boxShadow: "0 3px 10px rgba(37,99,235,0.35)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  progressTrack: {
    height: 2,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 0,
    overflow: "hidden",
    flexShrink: 0,
  },
  progressBar: {
    height: "100%",
    background: "rgba(167,139,250,0.6)",
    borderRadius: 0,
    transformOrigin: "left center",
    animation: `ct-shrink ${AUTO_DISMISS_MS}ms linear forwards`,
  },
};

// ── Subtitle generator ─────────────────────────────────────────────────────

function subtitleFor(current) {
  if (!current) return "";
  switch (current.type) {
    case "synonym":
      return `Accept to add "${current.payload?.newField}" as an alias for "${current.payload?.oldField}" in the linguistic model.`;
    case "color_map":
      return `Accept to lock these color assignments into your connection's color map.`;
    case "measure_default":
      return `Accept to set the default aggregation for this measure (full implementation coming).`;
    default:
      return "Accept to apply this correction to your connection.";
  }
}

// ── Spinner micro-component ────────────────────────────────────────────────

function Spinner() {
  return (
    <div
      style={{
        width: 11,
        height: 11,
        borderRadius: "50%",
        border: "1.5px solid rgba(255,255,255,0.25)",
        borderTopColor: "#fff",
        animation: "ct-spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function CorrectionToast({ connId }) {
  const correctionSuggestions = useStore((s) => s.correctionSuggestions);
  const dismissCorrectionSuggestion = useStore((s) => s.dismissCorrectionSuggestion);
  const linguisticModel = useStore((s) => s.linguisticModel);
  const colorMap = useStore((s) => s.colorMap);
  const setLinguisticModel = useStore((s) => s.setLinguisticModel);
  const setColorMap = useStore((s) => s.setColorMap);

  // We only ever show the first item in the queue
  const current = correctionSuggestions[0] ?? null;

  // Track saving state as a ref to avoid re-render races on fast accept
  const savingRef = useRef(false);
  const timerRef = useRef(null);

  // ── Auto-dismiss timer ────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    if (!current) return;
    clearTimeout(timerRef.current);
    dismissCorrectionSuggestion(current.id);
  }, [current, dismissCorrectionSuggestion]);

  useEffect(() => {
    if (!current) return;
    // Reset the timer whenever the current suggestion changes
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dismissCorrectionSuggestion(current.id);
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timerRef.current);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Accept handler ────────────────────────────────────────────────────

  const handleAccept = useCallback(async () => {
    if (!current || savingRef.current) return;
    savingRef.current = true;
    clearTimeout(timerRef.current);

    try {
      if (current.type === "synonym") {
        // Patch column synonyms in the linguistic model
        const { oldField, newField } = current.payload ?? {};
        if (!oldField || !newField) {
          dismissCorrectionSuggestion(current.id);
          savingRef.current = false;
          return;
        }
        const base = linguisticModel ?? {};
        const existingCols = base?.synonyms?.columns ?? {};
        const prevSyns = Array.isArray(existingCols[oldField])
          ? existingCols[oldField]
          : [];
        const updatedCols = {
          ...existingCols,
          [oldField]: [...new Set([...prevSyns, newField])],
        };
        const updated = {
          ...base,
          synonyms: {
            ...(base.synonyms ?? {}),
            columns: updatedCols,
          },
        };
        const saved = await api.saveLinguisticModel(connId, updated);
        setLinguisticModel(saved ?? updated);

      } else if (current.type === "color_map") {
        // Merge domain/range pairs into the color map
        const { domain = [], range = [] } = current.payload ?? {};
        const base = colorMap ?? {};
        const updated = { ...base };
        domain.forEach((field, i) => {
          if (range[i]) updated[field] = range[i];
        });
        const saved = await api.saveColorMap(connId, updated);
        setColorMap(saved ?? updated);

      }
      // measure_default: dismiss only (D4 implementation)
    } catch {
      // Silently dismiss on error — non-blocking toast must not surface hard errors
    } finally {
      savingRef.current = false;
      dismissCorrectionSuggestion(current.id);
    }
  }, [current, connId, linguisticModel, colorMap, setLinguisticModel, setColorMap, dismissCorrectionSuggestion]);

  // ── Render ────────────────────────────────────────────────────────────

  if (!current) return null;

  const subtitle = subtitleFor(current);

  return (
    <>
      {/* Keyframes — injected once; idempotent via className scope */}
      <style>{`
        @keyframes ct-slide-in {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes ct-shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
        @keyframes ct-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={S.container} data-testid="correction-toast">
        <div style={S.card}>

          {/* ── Body ─────────────────────────────────────────────── */}
          <div style={S.body}>
            <div style={S.eyebrow}>
              <span style={S.eyebrowDot} />
              Correction Suggestion
            </div>
            <p style={S.message}>{current.message}</p>
            {subtitle && <p style={S.subtitle}>{subtitle}</p>}
          </div>

          {/* ── Footer: Dismiss + Accept ──────────────────────────── */}
          <div style={S.footer}>
            <button
              type="button"
              onClick={dismiss}
              style={S.dismissBtn}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "var(--text-primary, #ededef)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted, #6b7280)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
              }}
            >
              Dismiss
            </button>

            <button
              type="button"
              onClick={handleAccept}
              style={S.acceptBtn}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent-light, #3b82f6)";
                e.currentTarget.style.boxShadow = "0 4px 14px rgba(37,99,235,0.45)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--accent, #2563eb)";
                e.currentTarget.style.boxShadow = "0 3px 10px rgba(37,99,235,0.35)";
              }}
            >
              {savingRef.current && <Spinner />}
              Accept
            </button>
          </div>

          {/* ── Auto-dismiss progress bar ─────────────────────────── */}
          <div style={S.progressTrack}>
            {/*
              key={current.id} forces the animation to restart when the
              suggestion changes — otherwise a residual bar from the previous
              toast would carry over to the new one.
            */}
            <div key={current.id} style={S.progressBar} />
          </div>

        </div>
      </div>
    </>
  );
}
