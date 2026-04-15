/**
 * Ambient module shims for Sub-project A Phase 1 editor JSX components.
 *
 * The chart-ir tsconfig scope is narrow — it only includes .ts/.tsx under
 * `src/chart-ir/**` and `src/components/editor/**`. The editor shell itself
 * is authored in plain JSX (to match the rest of `src/components/**`),
 * while the one file that consumes chart-ir types (VegaRenderer.tsx) is
 * TypeScript. These ambient declarations let the TS renderer + the TSX
 * tests import the JSX shell components without TS complaining that the
 * module can't be found / that props are required.
 *
 * Each module is declared with `any` props on purpose: the .jsx files are
 * the source of truth, and enforcing a prop contract from a .d.ts shim
 * would introduce a drift surface. Phase 2 can replace this with real
 * typed props if/when the editor shell is migrated to .tsx.
 */

type JsxEditorComponent = (props: any) => any;

// Editor shell
declare module '*/components/editor/ChartEditor' {
  const ChartEditor: JsxEditorComponent;
  export default ChartEditor;
}
declare module '*/components/editor/MarksCard' {
  const MarksCard: JsxEditorComponent;
  export default MarksCard;
}
declare module '*/components/editor/Pill' {
  const Pill: JsxEditorComponent;
  export default Pill;
}
declare module '*/components/editor/ChannelSlot' {
  const ChannelSlot: JsxEditorComponent;
  export default ChannelSlot;
}
declare module '*/components/editor/useChartEditorHotkeys' {
  const useChartEditorHotkeys: (opts: {
    undo?: () => void;
    redo?: () => void;
    enabled?: boolean;
  }) => void;
  export default useChartEditorHotkeys;
}

// On-object popovers
declare module '*/components/editor/onobject/OnObjectOverlay' {
  const OnObjectOverlay: JsxEditorComponent;
  export default OnObjectOverlay;
}
declare module '*/components/editor/onobject/AxisPopover' {
  const AxisPopover: JsxEditorComponent;
  export default AxisPopover;
}
declare module '*/components/editor/onobject/LegendPopover' {
  const LegendPopover: JsxEditorComponent;
  export default LegendPopover;
}
declare module '*/components/editor/onobject/SeriesPopover' {
  const SeriesPopover: JsxEditorComponent;
  export default SeriesPopover;
}
declare module '*/components/editor/onobject/TitleInlineEditor' {
  const TitleInlineEditor: JsxEditorComponent;
  export default TitleInlineEditor;
}
declare module '*/components/editor/onobject/popoverShell' {
  const PopoverShell: JsxEditorComponent;
  export default PopoverShell;
}
declare module '*/components/editor/AgentPanel' {
  const AgentPanel: JsxEditorComponent;
  export default AgentPanel;
}

// Dashboard archetype shell + layouts (Phase 4a)
declare module '*/components/dashboard/DashboardShell' {
  const DashboardShell: JsxEditorComponent;
  export default DashboardShell;
}
declare module '*/components/dashboard/DashboardModeToggle' {
  const DashboardModeToggle: JsxEditorComponent;
  export default DashboardModeToggle;
}
declare module '*/components/dashboard/modes/ExecBriefingLayout' {
  const ExecBriefingLayout: JsxEditorComponent;
  export default ExecBriefingLayout;
}
declare module '*/components/dashboard/modes/AnalystWorkbenchLayout' {
  const AnalystWorkbenchLayout: JsxEditorComponent;
  export default AnalystWorkbenchLayout;
}
declare module '*/components/dashboard/modes/LiveOpsLayout' {
  const LiveOpsLayout: JsxEditorComponent;
  export default LiveOpsLayout;
}
declare module '*/components/dashboard/modes/StoryLayout' {
  const StoryLayout: JsxEditorComponent;
  export default StoryLayout;
}
declare module '*/components/dashboard/modes/PitchLayout' {
  const PitchLayout: JsxEditorComponent;
  export default PitchLayout;
}
declare module '*/components/dashboard/modes/WorkbookLayout' {
  const WorkbookLayout: JsxEditorComponent;
  export default WorkbookLayout;
}

// Phase 5 — Stage Mode theme registry + provider + creative lane
declare module '*/components/editor/themes/themeRegistry' {
  export function getThemeTokens(id: string): any;
  export function listThemes(): any[];
  export function listStageThemes(): any[];
  export function listBaseThemes(): any[];
  export function themeToCssVars(tokens: any): Record<string, string>;
}
declare module '*/components/editor/themes/ThemeProvider' {
  const ThemeProvider: JsxEditorComponent;
  export default ThemeProvider;
}
declare module '*/components/editor/themes/creativeRegistry' {
  export function getCreativeComponent(name: string): any;
  export function listCreativeComponents(): string[];
}

// Zustand store (plain .js) — minimal shim so .ts tests can import it.
// The store is its own source of truth; this declaration just unblocks
// type-check on the test surface.
declare module '*/store' {
  export const useStore: any;
}
declare module '*/components/editor/ChartEditorTopbar' {
  const ChartEditorTopbar: JsxEditorComponent;
  export default ChartEditorTopbar;
}
declare module '*/components/editor/DataRail' {
  const DataRail: JsxEditorComponent;
  export default DataRail;
}
declare module '*/components/editor/EditorCanvas' {
  const EditorCanvas: JsxEditorComponent;
  export default EditorCanvas;
}
declare module '*/components/editor/BottomDock' {
  const BottomDock: JsxEditorComponent;
  export default BottomDock;
}
declare module '*/components/editor/Inspector/InspectorRoot' {
  const InspectorRoot: JsxEditorComponent;
  export default InspectorRoot;
}

// Placeholder renderers (JSX; only VegaRenderer is .tsx)
declare module '*/components/editor/renderers/MapLibreRenderer' {
  const MapLibreRenderer: JsxEditorComponent;
  export default MapLibreRenderer;
}
declare module '*/components/editor/renderers/DeckRenderer' {
  const DeckRenderer: JsxEditorComponent;
  export default DeckRenderer;
}
declare module '*/components/editor/renderers/CreativeRenderer' {
  const CreativeRenderer: JsxEditorComponent;
  export default CreativeRenderer;
}

// GPU tier util (JSX; consumed by both .tsx and .jsx)
declare module '*/lib/gpuDetect' {
  export function getGPUTier(): 'low' | 'medium' | 'high' | null;
  export const GPUTierProvider: any;
  export function useGPUTier(): 'low' | 'medium' | 'high' | null;
}
