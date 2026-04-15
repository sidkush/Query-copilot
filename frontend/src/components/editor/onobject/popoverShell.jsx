import { useEffect, useRef } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  FloatingPortal,
} from "@floating-ui/react";

/**
 * PopoverShell — shared shell for all on-object popovers (Axis, Legend,
 * Series, Title-inline). Anchors at a (clientX, clientY) point via
 * @floating-ui/react, handles outside-click + Escape dismiss, and
 * provides a consistent visual container.
 *
 * Phase 2b keeps the shell dumb: each popover is responsible for its
 * own field editors + spec patch dispatch. The shell only handles
 * positioning, focus trap, and dismissal.
 */
export default function PopoverShell({ x, y, onClose, title, children }) {
  const { refs, floatingStyles } = useFloating({
    open: true,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    placement: "bottom",
  });

  // Virtual reference element pinned at the click point.
  useEffect(() => {
    refs.setReference({
      getBoundingClientRect: () => ({
        x,
        y,
        left: x,
        top: y,
        right: x,
        bottom: y,
        width: 0,
        height: 0,
      }),
      contextElement: typeof document !== "undefined" ? document.body : undefined,
    });
  }, [x, y, refs]);

  const panelRef = useRef(null);

  // Outside-click + Escape dismiss.
  useEffect(() => {
    const onDocDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose && onClose();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose && onClose();
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <FloatingPortal>
      <div
        data-on-object-popover
        data-testid="on-object-popover"
        ref={(el) => {
          refs.setFloating(el);
          panelRef.current = el;
        }}
        style={{
          ...floatingStyles,
          zIndex: 1000,
          minWidth: 220,
          padding: 10,
          borderRadius: 6,
          background: "var(--bg-elev-3, #13131b)",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
          boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
          color: "var(--text-primary, #e7e7ea)",
          fontSize: 12,
        }}
      >
        {title && (
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted, rgba(255,255,255,0.5))",
              fontWeight: 700,
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
            }}
          >
            {title}
          </div>
        )}
        {children}
      </div>
    </FloatingPortal>
  );
}
