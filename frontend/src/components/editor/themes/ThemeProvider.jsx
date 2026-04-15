import { useMemo } from "react";
import { getThemeTokens, themeToCssVars } from "./themeRegistry";

/**
 * ThemeProvider — wraps the chart editor in a div that applies CSS
 * custom properties for the active theme. Uses inline style so each
 * provider scope is independent — a dashboard can mount two editors
 * with different themes at once without polluting document.documentElement.
 *
 * Phase 5 consumers: ChartEditor wraps its 3-pane grid in this
 * provider when mode === 'stage'; callers pass themeId via props.
 */
export default function ThemeProvider({ themeId = "dark", children, style }) {
  const cssVars = useMemo(() => themeToCssVars(getThemeTokens(themeId)), [themeId]);
  return (
    <div
      data-testid="theme-provider"
      data-theme={themeId}
      style={{
        ...cssVars,
        width: "100%",
        height: "100%",
        color: "var(--text-primary)",
        fontFamily: "var(--font-body)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
