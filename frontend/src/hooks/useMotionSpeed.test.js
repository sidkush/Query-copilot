import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMotionSpeed } from './useMotionSpeed';

describe('useMotionSpeed', () => {
  it('returns 0 when prefers-reduced-motion is set', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useMotionSpeed({ userPref: 150 }));
    expect(result.current).toBe(0);
  });

  it('returns userPref when prefers-reduced-motion is not set', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useMotionSpeed({ userPref: 300 }));
    expect(result.current).toBe(300);
  });
});
