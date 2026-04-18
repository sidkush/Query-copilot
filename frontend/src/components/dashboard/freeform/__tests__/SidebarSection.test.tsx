import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SidebarSection from '../panels/SidebarSection';
import { useStore } from '../../../../store';

describe('Plan 6c — SidebarSection', () => {
  beforeEach(() => {
    useStore.setState({ analystProSidebarCollapsed: new Set<string>() });
  });

  it('renders heading and children when expanded', () => {
    render(
      <SidebarSection id="objects" heading="Objects">
        <div data-testid="child">content</div>
      </SidebarSection>,
    );
    expect(screen.getByText('Objects')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('hides children when collapsed state contains id', () => {
    useStore.setState({ analystProSidebarCollapsed: new Set(['objects']) });
    render(
      <SidebarSection id="objects" heading="Objects">
        <div data-testid="child">content</div>
      </SidebarSection>,
    );
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('header click toggles collapse via store', () => {
    render(
      <SidebarSection id="objects" heading="Objects">
        <div data-testid="child">content</div>
      </SidebarSection>,
    );
    fireEvent.click(screen.getByRole('button', { name: /objects/i }));
    expect(useStore.getState().analystProSidebarCollapsed.has('objects')).toBe(true);
  });

  it('header has aria-expanded reflecting current state', () => {
    const { rerender } = render(
      <SidebarSection id="objects" heading="Objects">
        <div />
      </SidebarSection>,
    );
    const header = screen.getByRole('button', { name: /objects/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    useStore.setState({ analystProSidebarCollapsed: new Set(['objects']) });
    rerender(
      <SidebarSection id="objects" heading="Objects">
        <div />
      </SidebarSection>,
    );
    expect(screen.getByRole('button', { name: /objects/i })).toHaveAttribute('aria-expanded', 'false');
  });
});
