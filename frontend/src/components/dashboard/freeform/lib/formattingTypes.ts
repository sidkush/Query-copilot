// Plan 10a — TS mirror of backend/vizql/formatting_types.py.
// Build_Tableau.md §XIV.1 precedence: Mark > Field > Worksheet > DS > Workbook.

export enum StyleProp {
  FontFamily = 'font-family',
  FontSize = 'font-size',
  FontWeight = 'font-weight',
  FontStyle = 'font-style',
  Color = 'color',
  BackgroundColor = 'background-color',
  TextDecoration = 'text-decoration',
  TextAlign = 'text-align',
  LineHeight = 'line-height',
  NumberFormat = 'number-format',
  DateFormat = 'date-format',
  BorderTop = 'border-top',
  BorderRight = 'border-right',
  BorderBottom = 'border-bottom',
  BorderLeft = 'border-left',
  Padding = 'padding',
  ShowColumnBanding = 'show-column-banding',
  ShowRowBanding = 'show-row-banding',
  AxisTickColor = 'axis-tick-color',
  ZeroLineColor = 'zero-line-color',
  PaneLineThickness = 'pane-line-thickness',
}

export type SelectorKind = 'mark' | 'field' | 'sheet' | 'ds' | 'workbook';

export type Selector =
  | { kind: 'mark'; markId: string }
  | { kind: 'field'; fieldId: string }
  | { kind: 'sheet'; sheetId: string }
  | { kind: 'ds'; dsId: string }
  | { kind: 'workbook' };

export type StyleValue = string | number | boolean;

export interface StyleRule {
  readonly selector: Selector;
  readonly properties: Readonly<Record<StyleProp, StyleValue>>;
}

export interface LineStyle {
  weight: number;
  color: string;
  dash: 'solid' | 'dashed' | 'dotted' | 'dash-dot';
}

export const DEFAULT_LINE_STYLE: LineStyle = { weight: 1, color: '#000000', dash: 'solid' };

export interface StyledBox {
  backgroundColor: string;
  backgroundOpacity: number;
  borderTop: LineStyle;
  borderRight: LineStyle;
  borderBottom: LineStyle;
  borderLeft: LineStyle;
  shadow?: { x: number; y: number; blur: number; color: string };
}

export const DEFAULT_STYLED_BOX: StyledBox = {
  backgroundColor: '#ffffff',
  backgroundOpacity: 1.0,
  borderTop: DEFAULT_LINE_STYLE,
  borderRight: DEFAULT_LINE_STYLE,
  borderBottom: DEFAULT_LINE_STYLE,
  borderLeft: DEFAULT_LINE_STYLE,
};

export const NUMERIC_STYLE_PROPS: ReadonlySet<StyleProp> = new Set([
  StyleProp.FontSize,
  StyleProp.LineHeight,
  StyleProp.Padding,
  StyleProp.PaneLineThickness,
]);

export const BOOL_STYLE_PROPS: ReadonlySet<StyleProp> = new Set([
  StyleProp.ShowColumnBanding,
  StyleProp.ShowRowBanding,
]);
