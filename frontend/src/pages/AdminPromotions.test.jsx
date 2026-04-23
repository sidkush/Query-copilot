import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminPromotions from './AdminPromotions';

const mockFetchPending = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();

vi.mock('../store', () => ({
  useStore: (selector) => selector({
    promotions: {
      items: [
        {
          candidate_id: 'prom-001',
          question: 'how many trips in 2024',
          proposed_sql: 'SELECT COUNT(*) FROM trips WHERE year=2024',
          state: 'pending',
          first_admin: null,
        },
      ],
      loading: false,
    },
    fetchPendingPromotions: mockFetchPending,
    approvePromotion: mockApprove,
    rejectPromotion: mockReject,
  }),
}));

vi.mock('react-diff-viewer-continued', () => ({
  default: ({ newValue }) => <pre data-testid="diff-viewer">{newValue}</pre>,
}));

describe('AdminPromotions', () => {
  beforeEach(() => {
    mockFetchPending.mockClear();
    mockApprove.mockClear();
    mockReject.mockClear();
  });

  it('renders pending list', () => {
    render(<AdminPromotions />);
    expect(screen.getByText(/how many trips in 2024/i)).toBeInTheDocument();
  });

  it('fires fetchPendingPromotions on mount', () => {
    render(<AdminPromotions />);
    expect(mockFetchPending).toHaveBeenCalled();
  });

  it('shows proposed SQL in diff view', () => {
    render(<AdminPromotions />);
    expect(screen.getByText(/SELECT COUNT/i)).toBeInTheDocument();
  });

  it('calls approvePromotion when Approve clicked', () => {
    render(<AdminPromotions />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(mockApprove).toHaveBeenCalledWith('prom-001');
  });

  it('calls rejectPromotion when Reject confirmed', () => {
    render(<AdminPromotions />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    const input = screen.getByPlaceholderText(/reason/i);
    fireEvent.change(input, { target: { value: 'flaky SQL' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(mockReject).toHaveBeenCalledWith('prom-001', 'flaky SQL');
  });
});
