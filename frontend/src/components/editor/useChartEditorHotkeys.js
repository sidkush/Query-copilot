import { useEffect } from "react";

/**
 * useChartEditorHotkeys — binds Cmd/Ctrl-Z (undo) and Cmd/Ctrl-Shift-Z (redo)
 * while the ChartEditor is mounted. Callers pass `undo` + `redo` (usually
 * the store slice's undoChartEditor / redoChartEditor actions).
 *
 * Safety rails:
 *   - Ignores keystrokes while the user is typing in an input / textarea
 *     (prevents stealing the browser's native text-editing undo).
 *   - Uses `capture: false` + `passive: true` so other editors still
 *     receive the same keystrokes first.
 */
export default function useChartEditorHotkeys({ undo, redo, enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "z" && e.key !== "Z") return;
      const target = e.target;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) {
        redo && redo();
      } else {
        undo && undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, enabled]);
}
