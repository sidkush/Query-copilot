export interface PresetTokens {
  bg: string;
  fg: string;
  accent: string;
  accentWarn: string;
  border: string;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  density: 'compact' | 'comfortable' | 'spacious';
  radius: number;
}

export interface DashboardPreset {
  id: string;
  name: string;
  tagline: string;
  /** Fixed light|dark scheme — presets override the global theme toggle. */
  scheme: 'light' | 'dark';
  tokens: PresetTokens;
}

export function isDashboardPreset(v: unknown): v is DashboardPreset {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.tagline === 'string' &&
    (p.scheme === 'light' || p.scheme === 'dark') &&
    !!p.tokens && typeof p.tokens === 'object'
  );
}
