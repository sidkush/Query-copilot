import { CHART_PALETTES } from '../components/dashboard/tokens';

/**
 * Complete default formatting config.
 * Acts as the lowest-priority fallback in the 3-level cascade:
 *   tile.visualConfig  >  dashboard.themeConfig  >  FORMATTING_DEFAULTS
 */
export const FORMATTING_DEFAULTS = {
  typography: {
    titleFontSize: 13,
    titleFontWeight: 600,
    titleColor: '#EDEDEF',
    subtitleFontSize: 11,
    subtitleColor: '#8A8F98',
    titleAlign: 'left',
    axisFontSize: 11,
  },
  axis: {
    showXLabel: true,
    showYLabel: true,
    xLabel: '',
    yLabel: '',
    tickFormat: 'auto',
    tickDecimals: null,
    xLabelRotation: 0,
  },
  legend: {
    show: true,
    position: 'bottom',
    fontSize: 11,
    color: '#9ca3af',
  },
  grid: {
    show: true,
    color: '#162032',
    style: 'dashed',
    vertical: false,
  },
  dataLabels: {
    show: false,
    format: 'auto',
    position: 'top',
    fontSize: 11,
    color: null,
  },
  tooltip: {
    show: true,
    template: '',
  },
  referenceLines: [],
  sort: {
    field: null,
    order: 'desc',
  },
  colors: {
    mode: 'inherit',
    palette: null,
    measureColors: {},
    rules: [],
  },
  style: {
    background: null,
    borderColor: null,
    borderWidth: null,
    borderStyle: null,
    radius: null,
    padding: null,
    shadow: false,
    shadowBlur: 8,
  },
};

/**
 * Walk a dot-separated path into an object.
 * Returns undefined if any segment is missing.
 */
function getAtPath(obj, path) {
  if (obj == null) return undefined;
  const segments = path.split('.');
  let current = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[seg];
  }
  return current;
}

/**
 * Resolve a single value via the 3-level cascade.
 *
 * @param {string}  path         Dot-separated path, e.g. "typography.titleFontSize"
 * @param {object}  visualConfig Tile-level overrides (highest priority)
 * @param {object}  themeConfig  Dashboard-level defaults (mid priority)
 * @returns {*} First non-null, non-undefined value found
 */
export function getEffectiveValue(path, visualConfig, themeConfig) {
  const fromTile = getAtPath(visualConfig, path);
  if (fromTile !== null && fromTile !== undefined) return fromTile;

  const fromTheme = getAtPath(themeConfig, path);
  if (fromTheme !== null && fromTheme !== undefined) return fromTheme;

  return getAtPath(FORMATTING_DEFAULTS, path);
}

/**
 * Return a complete formatting object with no nulls by merging all three
 * cascade levels. Array fields use the first non-empty array found;
 * plain-object fields (measureColors) use the first present object.
 *
 * @param {object} visualConfig Tile-level overrides
 * @param {object} themeConfig  Dashboard-level defaults
 * @returns {object} Fully resolved formatting config
 */
export function mergeFormatting(visualConfig, themeConfig) {
  const vc = visualConfig || {};
  const tc = themeConfig || {};

  // Helper: pick the first present array, falling back to default empty.
  function pickArray(vcVal, tcVal, defaultVal) {
    if (Array.isArray(vcVal) && vcVal.length > 0) return vcVal;
    if (Array.isArray(tcVal) && tcVal.length > 0) return tcVal;
    return defaultVal;
  }

  // Helper: pick the first present plain object, falling back to default empty.
  function pickObject(vcVal, tcVal, defaultVal) {
    if (vcVal != null && typeof vcVal === 'object' && !Array.isArray(vcVal) && Object.keys(vcVal).length > 0) return vcVal;
    if (tcVal != null && typeof tcVal === 'object' && !Array.isArray(tcVal) && Object.keys(tcVal).length > 0) return tcVal;
    return defaultVal;
  }

  // Shortcut for resolving scalars.
  const ev = (path) => getEffectiveValue(path, vc, tc);

  return {
    typography: {
      titleFontSize: ev('typography.titleFontSize'),
      titleFontWeight: ev('typography.titleFontWeight'),
      titleColor: ev('typography.titleColor'),
      subtitleFontSize: ev('typography.subtitleFontSize'),
      subtitleColor: ev('typography.subtitleColor'),
      titleAlign: ev('typography.titleAlign'),
      axisFontSize: ev('typography.axisFontSize'),
    },
    axis: {
      showXLabel: ev('axis.showXLabel'),
      showYLabel: ev('axis.showYLabel'),
      xLabel: ev('axis.xLabel'),
      yLabel: ev('axis.yLabel'),
      tickFormat: ev('axis.tickFormat'),
      tickDecimals: ev('axis.tickDecimals'),
      xLabelRotation: ev('axis.xLabelRotation'),
    },
    legend: {
      show: ev('legend.show'),
      position: ev('legend.position'),
      fontSize: ev('legend.fontSize'),
      color: ev('legend.color'),
    },
    grid: {
      show: ev('grid.show'),
      color: ev('grid.color'),
      style: ev('grid.style'),
      vertical: ev('grid.vertical'),
    },
    dataLabels: {
      show: ev('dataLabels.show'),
      format: ev('dataLabels.format'),
      position: ev('dataLabels.position'),
      fontSize: ev('dataLabels.fontSize'),
      color: ev('dataLabels.color'),
    },
    tooltip: {
      show: ev('tooltip.show'),
      template: ev('tooltip.template'),
    },
    referenceLines: pickArray(
      vc.referenceLines,
      tc.referenceLines,
      [],
    ),
    sort: {
      field: ev('sort.field'),
      order: ev('sort.order'),
    },
    colors: {
      mode: ev('colors.mode'),
      palette: ev('colors.palette'),
      measureColors: pickObject(
        vc.colors?.measureColors,
        tc.colors?.measureColors,
        {},
      ),
      rules: pickArray(
        vc.colors?.rules,
        tc.colors?.rules,
        [],
      ),
    },
    style: {
      background: ev('style.background'),
      borderColor: ev('style.borderColor'),
      borderWidth: ev('style.borderWidth'),
      borderStyle: ev('style.borderStyle'),
      radius: ev('style.radius'),
      padding: ev('style.padding'),
      shadow: ev('style.shadow'),
      shadowBlur: ev('style.shadowBlur'),
    },
  };
}

/**
 * Resolve the color for a specific measure/data-value using the 5-level cascade:
 *   1. Conditional rules matching (measure, dataValue)
 *   2. measureColors[measure]
 *   3. Tile palette override (colorsConfig.palette)
 *   4. Dashboard theme palette
 *   5. CHART_PALETTES.default
 *
 * @param {string} measure          Measure/series name
 * @param {*}      dataValue        Current data value (for conditional rules)
 * @param {number} measureIndex     Index of this measure in the series list
 * @param {object} colorsConfig     Merged colors section from mergeFormatting()
 * @param {string} dashboardPalette Palette name from dashboard theme, e.g. "ocean"
 * @returns {string} Hex color string
 */
export function resolveColor(measure, dataValue, measureIndex, colorsConfig, dashboardPalette) {
  const cfg = colorsConfig || {};

  // 1. Conditional rules
  if (Array.isArray(cfg.rules)) {
    for (const rule of cfg.rules) {
      if (rule.measure && rule.measure !== measure) continue;
      if (evaluateCondition(dataValue, rule)) return rule.color;
    }
  }

  // 2. Per-measure custom color
  if (cfg.measureColors && cfg.measureColors[measure]) {
    return cfg.measureColors[measure];
  }

  // 3. Tile palette override
  if (cfg.palette && CHART_PALETTES[cfg.palette]) {
    const pal = CHART_PALETTES[cfg.palette];
    return pal[measureIndex % pal.length];
  }

  // 4. Dashboard theme palette
  if (dashboardPalette && CHART_PALETTES[dashboardPalette]) {
    const pal = CHART_PALETTES[dashboardPalette];
    return pal[measureIndex % pal.length];
  }

  // 5. Fallback to default palette
  const fallback = CHART_PALETTES.default;
  return fallback[measureIndex % fallback.length];
}

/**
 * Evaluate a conditional rule against a data value.
 */
function evaluateCondition(dataValue, rule) {
  const v = Number(dataValue);
  const rv = Number(rule.value);

  switch (rule.condition) {
    case '>':   return v > rv;
    case '>=':  return v >= rv;
    case '<':   return v < rv;
    case '<=':  return v <= rv;
    case '===': return dataValue === rule.value;
    case '!==': return dataValue !== rule.value;
    case 'range': {
      const rv2 = Number(rule.value2);
      return v >= rv && v <= rv2;
    }
    default: return false;
  }
}

/**
 * Format an axis tick value.
 *
 * @param {*}      value    Raw tick value
 * @param {string} format   'auto' | 'integer' | 'decimal' | 'currency' | 'percent'
 * @param {number} decimals Number of decimal places (used by 'decimal', 'currency', 'percent')
 * @returns {string}
 */
export function formatTickValue(value, format, decimals) {
  const num = Number(value);
  if (isNaN(num)) return String(value);

  const dec = decimals != null ? decimals : 2;

  switch (format) {
    case 'integer':
      return Math.round(num).toLocaleString();

    case 'decimal':
      return num.toFixed(dec);

    case 'currency':
      return '$' + num.toLocaleString(undefined, {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });

    case 'percent':
      return (num * 100).toFixed(dec) + '%';

    case 'auto':
    default: {
      const abs = Math.abs(num);
      if (abs >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
      if (abs >= 1_000_000)     return (num / 1_000_000).toFixed(1) + 'M';
      if (abs >= 1_000)         return (num / 1_000).toFixed(1) + 'K';
      if (Number.isInteger(num)) return num.toLocaleString();
      return num.toFixed(dec);
    }
  }
}
