import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { api } from "../../api";
import { SPRINGS } from "../dashboard/motion";

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

const DEFAULT_AUTO_DISMISS_MS = 8000;

// ── Style constants ────────────────────────────────────────────────────────

const S = {
  container: (dockVisible) => ({
    position: "absolute",
    // Offset bottom edge based on whether BottomDock is rendered. When the
    // dock is visible we clear it with 96px; when hidden, 24px from canvas edge.
    bottom: dockVisible ? 96 : 24,
    right: 16,
    width: 360,
    zIndex: 60,
    pointerEvents: "all",
  }),
  card: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow:
      "0 16px 48px var(--shadow-deep), 0 0 0 1px var(--glass-highlight) inset",
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
    border: "1px solid var(--border-default)",
    background: "transparent",
    color: "var(--text-muted)",
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
    letterSpacing: "0.01em",
    boxShadow: "0 3px 10px rgba(37,99,235,0.35)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    position: "relative",
    overflow: "hidden",
  },
  progressTrack: {
    height: 2,
    background: "var(--overlay-medium)",
    borderRadius: 0,
    overflow: "hidden",
    flexShrink: 0,
  },
  progressBar: {
    height: "100%",
    background: "rgba(167,139,250,0.6)",
    borderRadius: 0,
    transformOrigin: "left center",
    animationName: "ct-shrink",
    animationTimingFunction: "linear",
    animationFillMode: "forwards",
    position: "relative",
    overflow: "hidden",
    // animationDuration supplied inline at render-time so JS timer + CSS bar stay in sync
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

export default function CorrectionToast({
  connId,
  dockVisible = true,
  dismissTimeMs = DEFAULT_AUTO_DISMISS_MS,
}) {
  const correctionSuggestions = useStore((s) => s.correctionSuggestions);
  const dismissCorrectionSuggestion = useStore((s) => s.dismissCorrectionSuggestion);
  const linguisticModel = useStore((s) => s.linguisticModel);
  const colorMap = useStore((s) => s.colorMap);
  const setLinguisticModel = useStore((s) => s.setLinguisticModel);
  const setColorMap = useStore((s) => s.setColorMap);

  // Reactive hover state — no DOM style mutation
  const [dismissHover, setDismissHover] = useState(false);
  const [acceptHover, setAcceptHover] = useState(false);

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
    }, dismissTimeMs);

    return () => clearTimeout(timerRef.current);
  }, [current?.id, dismissTimeMs]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const subtitle = current ? subtitleFor(current) : "";

  return (
    <>
      {/* Keyframes — injected once; idempotent via className scope */}
      <style>{`
        @keyframes ct-shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
        @keyframes ct-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            style={S.container(dockVisible)}
            data-testid="correction-toast"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={SPRINGS.fluid}
          >
            <div className="premium-liquid-glass" style={S.card}>

              {/* ── Body ─────────────────────────────────────────────── */}
              <div style={S.body}>
                <div style={S.eyebrow}>
                  <span style={S.eyebrowDot} className="premium-breathe" />
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
                  onMouseEnter={() => setDismissHover(true)}
                  onMouseLeave={() => setDismissHover(false)}
                  onFocus={() => setDismissHover(true)}
                  onBlur={() => setDismissHover(false)}
                  className="premium-btn"
                  style={{
                    ...S.dismissBtn,
                    background: dismissHover ? "var(--bg-hover)" : "transparent",
                    color: dismissHover
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    borderColor: dismissHover
                      ? "var(--border-hover)"
                      : "var(--border-default)",
                  }}
                >
                  Dismiss
                </button>

                <button
                  type="button"
                  onClick={handleAccept}
                  onMouseEnter={() => setAcceptHover(true)}
                  onMouseLeave={() => setAcceptHover(false)}
                  onFocus={() => setAcceptHover(true)}
                  onBlur={() => setAcceptHover(false)}
                  className="premium-btn premium-sheen"
                  style={{
                    ...S.acceptBtn,
                    background: acceptHover
                      ? "var(--accent-light, #3b82f6)"
                      : "var(--accent, #2563eb)",
                    boxShadow: acceptHover
                      ? "0 4px 14px rgba(37,99,235,0.45)"
                      : "0 3px 10px rgba(37,99,235,0.35)",
                  }}
                >
                  {savingRef.current && <Spinner />}
                  Accept
                </button>
              </div>

              {/* ── Auto-dismiss progress bar — shimmer overlay makes it alive ── */}
              <div style={S.progressTrack}>
                {/*
                  key={current.id} forces the animation to restart when the
                  suggestion changes — otherwise a residual bar from the previous
                  toast would carry over to the new one.
                */}
                <div
                  key={current.id}
                  className="premium-shimmer-surface"
                  style={{ ...S.progressBar, animationDuration: `${dismissTimeMs}ms` }}
                />
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
