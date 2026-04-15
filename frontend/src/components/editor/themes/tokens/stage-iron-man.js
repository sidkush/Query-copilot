/**
 * Stage · Iron Man — holographic HUD aesthetic. Primary accent is the
 * unmistakable Tony Stark cyan; secondary is the arc reactor amber.
 * Pairs with the Three.js Hologram creative renderer in the Stage
 * creative-lane registry.
 */
const stageIronMan = {
  id: "stage-iron-man",
  label: "Stage · Iron Man",
  kind: "stage",
  bgPage: "#020712",
  bgElev1: "rgba(0,229,255,0.04)",
  bgElev2: "rgba(0,229,255,0.08)",
  bgElev3: "#031827",
  textPrimary: "#e6f7ff",
  textSecondary: "#81d8ff",
  textMuted: "rgba(129,216,255,0.45)",
  borderSubtle: "rgba(0,229,255,0.2)",
  accent: "rgba(0,229,255,0.45)",
  accentBg: "rgba(0,229,255,0.12)",
  chartPalette: [
    "#00e5ff",
    "#ffb347",
    "#ff5630",
    "#36e4a5",
    "#7df9ff",
    "#ffaf00",
    "#68dafe",
    "#ff8a65",
  ],
  fontBody: "'Chakra Petch', Inter, system-ui, sans-serif",
  fontDisplay: "'Orbitron', 'Chakra Petch', sans-serif",
};

export default stageIronMan;
