// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewportWidth, NARROW_WIDTH } from './useViewportWidth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useViewportWidth', () => {
  it('reads the initial width and updates on resize', () => {
    vi.stubGlobal('innerWidth', 1200);
    const { result } = renderHook(() => useViewportWidth());
    expect(result.current).toBe(1200);
    act(() => {
      vi.stubGlobal('innerWidth', 700);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(700);
  });

  it('exposes the narrow threshold', () => {
    expect(NARROW_WIDTH).toBe(900);
  });
});
