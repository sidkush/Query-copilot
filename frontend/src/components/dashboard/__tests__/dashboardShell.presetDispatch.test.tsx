import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DashboardShell from '../DashboardShell';
import { useStore } from '../../../store';
import { emptyDashboardForPreset } from '../freeform/lib/dashboardShape';

describe('DashboardShell preset dispatch', () => {
  beforeEach(() => {
    cleanup();
    useStore.setState({ analystProDashboard: emptyDashboardForPreset('analyst-pro') });
  });

  it('mounts AnalystProLayout when activePresetId is analyst-pro', async () => {
    render(<DashboardShell tiles={[]} initialMode="analyst-pro" />);
    // AnalystProLayout pulls in ~40 lazy modules (freeform panels, vega, etc.)
    // under jsdom. Give it a generous timeout — the themed bespoke layouts
    // are trivial components so they mount instantly in the other cases.
    expect(await screen.findByTestId('layout-analyst-pro', {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it('mounts BoardPackLayout when activePresetId is board-pack', async () => {
    useStore.getState().switchPreset('board-pack');
    render(<DashboardShell tiles={[]} initialMode="analyst-pro" />);
    expect(await screen.findByTestId('layout-board-pack')).toBeInTheDocument();
  });

  it('mounts OperatorConsoleLayout when activePresetId is operator-console', async () => {
    useStore.getState().switchPreset('operator-console');
    render(<DashboardShell tiles={[]} initialMode="analyst-pro" />);
    expect(await screen.findByTestId('layout-operator-console')).toBeInTheDocument();
  });

  it('mounts SignalLayout when activePresetId is signal — registered synthetically', async () => {
    const { _registerPreset } = await import('../presets/registry');
    if (!(await import('../presets/registry')).listPresets().some((p) => p.id === 'signal')) {
      _registerPreset({
        id: 'signal', name: 'Signal', tagline: '', scheme: 'dark',
        tokens: { bg: '#0b0f17', fg: '#e7e9ef', accent: '#4ecdc4', accentWarn: '#f47272', border: '#1a1f2b', fontDisplay: 'sans-serif', fontBody: 'sans-serif', fontMono: 'monospace', density: 'comfortable', radius: 10 },
      } as never);
    }
    useStore.getState().switchPreset('signal');
    render(<DashboardShell tiles={[]} initialMode="analyst-pro" />);
    expect(await screen.findByTestId('layout-signal')).toBeInTheDocument();
  });

  it('mounts EditorialBriefLayout when activePresetId is editorial-brief — registered synthetically', async () => {
    const { _registerPreset, listPresets } = await import('../presets/registry');
    if (!listPresets().some((p) => p.id === 'editorial-brief')) {
      _registerPreset({
        id: 'editorial-brief', name: 'Editorial Brief', tagline: '', scheme: 'light',
        tokens: { bg: '#f4efe4', fg: '#181613', accent: '#c0793a', accentWarn: '#9a5820', border: '#d4cdbf', fontDisplay: 'serif', fontBody: 'serif', fontMono: 'monospace', density: 'spacious', radius: 2 },
      } as never);
    }
    useStore.getState().switchPreset('editorial-brief');
    render(<DashboardShell tiles={[]} initialMode="analyst-pro" />);
    expect(await screen.findByTestId('layout-editorial-brief')).toBeInTheDocument();
  });
});
