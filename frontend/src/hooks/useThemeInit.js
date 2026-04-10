import { useEffect } from "react";
import { useStore } from "../store";

/**
 * Initialize theme on app mount.
 * - Applies .light class to <html> based on stored preference
 * - Listens to OS prefers-color-scheme when preference is "system"
 * Call once in the top-level component (App.jsx).
 */
export default function useThemeInit() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  useEffect(() => {
    // Apply initial theme class
    const resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.classList.toggle("light", resolved === "light");

    // Listen to OS theme changes when preference is "system"
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => setTheme("system"); // re-resolves
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme, setTheme]);
}
