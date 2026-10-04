// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnread } from './useUnread';

type Args = Parameters<typeof useUnread>;

const setup = (initial: Args) =>
  renderHook((args: Args) => useUnread(...args), { initialProps: initial });

describe('useUnread', () => {
  it('a new run starts with the opening message unread', () => {
    const { result } = setup([1, false, 'run-1', false]);
    expect(result.current).toBe(true);
  });

  it('a resumed run starts with everything read', () => {
    const { result } = setup([3, false, 'run-1', true]);
    expect(result.current).toBe(false);
  });

  it('focusing comms reads everything, and new activity while focused stays read', () => {
    const { result, rerender } = setup([1, false, 'run-1', false]);
    rerender([1, true, 'run-1', false]);
    expect(result.current).toBe(false);
    rerender([2, true, 'run-1', false]);
    expect(result.current).toBe(false);
    rerender([2, false, 'run-1', false]);
    expect(result.current).toBe(false);
    rerender([3, false, 'run-1', false]);
    expect(result.current).toBe(true);
  });

  it('a new run resets what was seen', () => {
    const { result, rerender } = setup([2, true, 'run-1', true]);
    expect(result.current).toBe(false);
    rerender([1, false, 'run-2', false]);
    expect(result.current).toBe(true);
  });

  it('is never unread before a game exists', () => {
    const { result } = setup([1, false, null, false]);
    expect(result.current).toBe(false);
  });
});
