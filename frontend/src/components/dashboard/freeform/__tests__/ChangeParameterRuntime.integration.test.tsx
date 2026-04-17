import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import { publish } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';

function Harness() {
  useActionRuntime();
  return null;
}

const baseDashboard = {
  id: 'd1',
  archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
  floatingLayer: [],
  worksheets: [],
  parameters: [{
    id: 'p1',
    name: 'region',
    type: 'string',
    value: 'East',
    domain: { kind: 'list', values: ['East', 'West', 'North'] },
    createdAt: '2026-04-16T00:00:00Z',
  }],
  sets: [],
  actions: [{
    id: 'a1',
    kind: 'change-parameter',
    name: 'SetRegion',
    enabled: true,
    sourceSheets: ['src'],
    trigger: 'select',
    targetParameterId: 'p1',
    fieldMapping: [{ source: 'Region', target: 'region' }],
  }],
};

describe('ChangeParameterRuntime integration', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: baseDashboard,
      analystProActionCascadeToken: 0,
      analystProActiveCascadeTargets: {},
    });
  });

  it('change-parameter action updates the parameter value', () => {
    render(<Harness />);
    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'West' },
        timestamp: Date.now(),
      });
    });
    const params = useStore.getState().analystProDashboard.parameters;
    expect(params[0].value).toBe('West');
  });

  it('change-parameter with out-of-domain value is rejected (no change)', () => {
    render(<Harness />);
    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'South' }, // not in list ['East','West','North']
        timestamp: Date.now(),
      });
    });
    const params = useStore.getState().analystProDashboard.parameters;
    expect(params[0].value).toBe('East');
  });

  it('change-parameter with unknown parameterId is a no-op', () => {
    useStore.setState({
      analystProDashboard: {
        ...baseDashboard,
        actions: [{
          ...baseDashboard.actions[0],
          targetParameterId: 'ghost',
        }],
      },
    });
    render(<Harness />);
    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'West' },
        timestamp: Date.now(),
      });
    });
    const params = useStore.getState().analystProDashboard.parameters;
    expect(params[0].value).toBe('East');
  });
});
