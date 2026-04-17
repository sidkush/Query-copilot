import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChartEditor from '../../../components/editor/ChartEditor';
import { SIMPLE_BAR } from '../fixtures/canonical-charts';
import { REGION_DIM, REVENUE_MEASURE } from '../fixtures/column-profiles';

// ChartEditor mounts SemanticFieldRail which calls useNavigate() — wrap in Router.
const render = (ui: React.ReactElement) =>
  rtlRender(ui, { wrapper: MemoryRouter });

const resultSet = {
  columns: ['region', 'revenue'],
  rows: [
    ['North', 100],
    ['South', 80],
  ],
  columnProfile: [REGION_DIM, REVENUE_MEASURE],
};

describe('ChartEditor shell', () => {
  it('renders all 3 panes in pro mode (DataRail + Canvas + Inspector + Topbar + Dock)', () => {
    render(<ChartEditor spec={SIMPLE_BAR} resultSet={resultSet} mode="pro" />);
    expect(screen.getByTestId('chart-editor')).toBeDefined();
    expect(screen.getByTestId('chart-editor-topbar')).toBeDefined();
    expect(screen.getByTestId('data-rail')).toBeDefined();
    expect(screen.getByTestId('editor-canvas')).toBeDefined();
    expect(screen.getByTestId('inspector-root')).toBeDefined();
    expect(screen.getByTestId('bottom-dock')).toBeDefined();
  });

  it('collapses DataRail in default mode (Inspector still shown, Dock still shown)', () => {
    render(<ChartEditor spec={SIMPLE_BAR} resultSet={resultSet} mode="default" />);
    expect(screen.queryByTestId('data-rail')).toBeNull();
    expect(screen.getByTestId('inspector-root')).toBeDefined();
    expect(screen.getByTestId('bottom-dock')).toBeDefined();
    expect(screen.getByTestId('editor-canvas')).toBeDefined();
  });

  it('collapses DataRail + Inspector + Dock in stage mode (cinematic)', () => {
    render(<ChartEditor spec={SIMPLE_BAR} resultSet={resultSet} mode="stage" />);
    expect(screen.queryByTestId('data-rail')).toBeNull();
    expect(screen.queryByTestId('inspector-root')).toBeNull();
    expect(screen.queryByTestId('bottom-dock')).toBeNull();
    expect(screen.getByTestId('editor-canvas')).toBeDefined();
    expect(screen.getByTestId('chart-editor-topbar')).toBeDefined();
  });

  it('sets data-mode attribute on the root element', () => {
    const { rerender } = render(
      <ChartEditor spec={SIMPLE_BAR} resultSet={resultSet} mode="pro" />,
    );
    expect(screen.getByTestId('chart-editor').getAttribute('data-mode')).toBe('pro');
    rerender(<ChartEditor spec={SIMPLE_BAR} resultSet={resultSet} mode="stage" />);
    expect(screen.getByTestId('chart-editor').getAttribute('data-mode')).toBe('stage');
  });
});
