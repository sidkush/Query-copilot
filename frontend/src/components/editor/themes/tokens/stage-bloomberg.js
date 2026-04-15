/**
 * Stage · Bloomberg — trading-terminal aesthetic. Black background,
 * amber primary, green/red trade colors for cartesian palette.
 * Monospace body to read like a terminal.
 */
const stageBloomberg = {
  id: "stage-bloomberg",
  label: "Stage · Bloomberg",
  kind: "stage",
  bgPage: "#000000",
  bgElev1: "rgba(255,170,0,0.04)",
  bgElev2: "rgba(255,170,0,0.07)",
  bgElev3: "#0a0700",
  textPrimary: "#ffaa00",
  textSecondary: "#d68c00",
  textMuted: "rgba(255,170,0,0.45)",
  borderSubtle: "rgba(255,170,0,0.18)",
  accent: "rgba(255,170,0,0.4)",
  accentBg: "rgba(255,170,0,0.1)",
  chartPalette: [
    "#ffaa00",
    "#00ff7f",
    "#ff3b3b",
    "#ffd166",
    "#9bf2a1",
    "#ff6b6b",
    "#fff066",
    "#66ffc2",
  ],
  fontBody: "'IBM Plex Mono', 'Fira Code', monospace",
  fontDisplay: "'IBM Plex Mono', 'Fira Code', monospace",
};

export default stageBloomberg;
