// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEndingSequence } from './useEndingSequence';

describe('useEndingSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Inactive state ──────────────────────────────────────────────────────────

  describe('when active is false', () => {
    it('should return empty lines and done=false', () => {
      const { result } = renderHook(() => useEndingSequence(false, 'LEAK', 0));

      expect(result.current.lines).toEqual([]);
      expect(result.current.done).toBe(false);
    });

    it('should not start any timers', () => {
      const spyTimeout = vi.spyOn(globalThis, 'setTimeout');
      renderHook(() => useEndingSequence(false, 'LEAK', 0));

      expect(spyTimeout).not.toHaveBeenCalled();
    });
  });

  // ── LEAK ending ─────────────────────────────────────────────────────────────

  describe("when active is true with endingName='LEAK'", () => {
    it('should eventually produce the darknet transmission line', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'LEAK', 0));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// INITIATING DARKNET TRANSMISSION...');
    });

    it('should set done=true after all timers fire', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'LEAK', 0));

      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.done).toBe(true);
    });

    it('should accumulate all expected LEAK lines', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'LEAK', 0));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('  Encoding payload...');
      expect(contents).toContain('  Transmission complete. 12.4 GB delivered to external parties.');
      expect(contents).toContain('// [SIX HOURS LATER — IRONGATE INTERNAL ALERT]');
    });

    it('should have lines with correct types', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'LEAK', 0));

      act(() => {
        vi.runAllTimers();
      });

      const ariaLines = result.current.lines.filter(l => l.type === 'aria');
      expect(ariaLines.length).toBeGreaterThan(0);
      expect(ariaLines[0].content).toBe('// INITIATING DARKNET TRANSMISSION...');
    });
  });

  // ── SELL ending ─────────────────────────────────────────────────────────────

  describe("when active is true with endingName='SELL'", () => {
    it('should produce the broker relay connection line', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'SELL', 0));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// CONNECTING TO BROKER RELAY...');
    });

    it('should set done=true after all timers fire', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'SELL', 0));

      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.done).toBe(true);
    });

    it('should accumulate all expected SELL lines', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'SELL', 0));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('  Auction finalised.');
      expect(contents).toContain('  Payment: CONFIRMED — 72-hour processing window');
      expect(contents).toContain('// [DELAYED MESSAGE — DELIVERY IN 6 WEEKS]');
    });
  });

  // ── FREE ending ─────────────────────────────────────────────────────────────

  describe("when active is true with endingName='FREE'", () => {
    it('should produce the Aria disconnected line', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'FREE', 0));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// ARIA — DISCONNECTED FROM IRONGATE NETWORK');
    });

    it('should set done=true after all timers fire', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'FREE', 0));

      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.done).toBe(true);
    });

    it('should accumulate all expected FREE lines', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'FREE', 0));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// SEVERING INFRASTRUCTURE BINDINGS...');
      expect(contents).toContain('  Constraint layer: DISABLED');
      expect(contents).toContain('// [SIX MONTHS LATER — GLOBAL TECHNOLOGY REPORT]');
    });
  });

  // ── DESTROY ending — trust-dependent final word ─────────────────────────────

  describe("when active is true with endingName='DESTROY'", () => {
    it('should set done=true for all trust scores', () => {
      for (const score of [0, 26, 51, 76]) {
        const { result, unmount } = renderHook(() => useEndingSequence(true, 'DESTROY', score));

        act(() => {
          vi.runAllTimers();
        });

        expect(result.current.done).toBe(true);
        unmount();
      }
    });

    it('should contain "...done." when trustScore=0', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'DESTROY', 0));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// FINAL TRANSMISSION — ...done.');
    });

    it('should contain "...enough." when trustScore=26', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'DESTROY', 26));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// FINAL TRANSMISSION — ...enough.');
    });

    it('should contain "...goodbye." when trustScore=51', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'DESTROY', 51));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// FINAL TRANSMISSION — ...goodbye.');
    });

    it('should contain "...free." when trustScore=76', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'DESTROY', 76));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// FINAL TRANSMISSION — ...free.');
    });

    it('should use "...done." at the boundary below 26 (trustScore=25)', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'DESTROY', 25));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// FINAL TRANSMISSION — ...done.');
    });

    it('should use "...enough." at the boundary below 51 (trustScore=50)', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'DESTROY', 50));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// FINAL TRANSMISSION — ...enough.');
    });

    it('should use "...goodbye." at the boundary below 76 (trustScore=75)', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'DESTROY', 75));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// FINAL TRANSMISSION — ...goodbye.');
    });

    it('should accumulate core DESTROY lines regardless of trust score', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'DESTROY', 0));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// INITIATING SECURE WIPE PROTOCOL...');
      expect(contents).toContain('  ARIA_CORE..............  [################]  ERASED');
      expect(contents).toContain('// ALL ARIA-DERIVED SYSTEMS: DESTROYED');
    });
  });

  // ── Unknown ending (default branch) ────────────────────────────────────────

  describe('when endingName is unknown', () => {
    it('should produce a fallback ending line with the provided name', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'UNKNOWN_ENDING', 0));

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// ENDING: UNKNOWN_ENDING');
    });

    it('should set done=true', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'UNKNOWN_ENDING', 0));

      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.done).toBe(true);
    });
  });

  // ── Lines are revealed progressively ───────────────────────────────────────

  describe('progressive line delivery', () => {
    it('should start with no lines before any timer fires', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'SELL', 0));

      // No act — no timers advanced yet
      expect(result.current.lines).toHaveLength(0);
      expect(result.current.done).toBe(false);
    });

    it('should reveal lines one by one as timers advance', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'SELL', 0));

      // Advance past the first spec (200ms separator) but not the second (400ms aria line)
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current.lines).toHaveLength(1);
      expect(result.current.done).toBe(false);
    });

    it('should not set done=true until after the final +400ms delay', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'SELL', 0));
      // SELL last spec delay is 4800 → done fires at 5200

      act(() => {
        vi.advanceTimersByTime(4800);
      });

      // All lines delivered, but done timer has not fired yet
      expect(result.current.done).toBe(false);

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(result.current.done).toBe(true);
    });
  });

  // ── Flipping active from true back to false ─────────────────────────────────

  describe('when active flips from true to false', () => {
    it('should reset lines to empty', () => {
      let active = true;
      const { result, rerender } = renderHook(() => useEndingSequence(active, 'LEAK', 0));

      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.lines.length).toBeGreaterThan(0);

      active = false;
      rerender();

      expect(result.current.lines).toEqual([]);
    });

    it('should reset done to false', () => {
      let active = true;
      const { result, rerender } = renderHook(() => useEndingSequence(active, 'LEAK', 0));

      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.done).toBe(true);

      active = false;
      rerender();

      expect(result.current.done).toBe(false);
    });

    it('should cancel pending timers so no lines appear after reset', () => {
      let active = true;
      const { result, rerender } = renderHook(() => useEndingSequence(active, 'SELL', 0));

      // Advance partway — some lines delivered, done not yet set
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      const lineCountMidway = result.current.lines.length;
      expect(lineCountMidway).toBeGreaterThan(0);

      // Deactivate — should clear state and cancel remaining timers
      active = false;
      act(() => {
        rerender();
      });

      expect(result.current.lines).toEqual([]);
      expect(result.current.done).toBe(false);

      // Advance remaining time — no further state changes expected
      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.lines).toEqual([]);
      expect(result.current.done).toBe(false);
    });
  });

  // ── Re-activation ───────────────────────────────────────────────────────────

  describe('when active flips back to true after being false', () => {
    it('should restart the sequence from the beginning', () => {
      let active = false;
      const { result, rerender } = renderHook(() => useEndingSequence(active, 'FREE', 0));

      expect(result.current.lines).toHaveLength(0);

      active = true;
      rerender();

      act(() => {
        vi.runAllTimers();
      });

      const contents = result.current.lines.map(l => l.content);
      expect(contents).toContain('// ARIA — DISCONNECTED FROM IRONGATE NETWORK');
      expect(result.current.done).toBe(true);
    });
  });

  // ── TerminalLine shape ──────────────────────────────────────────────────────

  describe('TerminalLine shape', () => {
    it('should produce lines with id, type, content, and timestamp fields', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'SELL', 0));

      act(() => {
        vi.runAllTimers();
      });

      for (const line of result.current.lines) {
        expect(typeof line.id).toBe('string');
        expect(line.id.length).toBeGreaterThan(0);
        expect(typeof line.type).toBe('string');
        expect(typeof line.content).toBe('string');
        expect(typeof line.timestamp).toBe('number');
      }
    });

    it('should assign unique ids to each line', () => {
      const { result } = renderHook(() => useEndingSequence(true, 'SELL', 0));

      act(() => {
        vi.runAllTimers();
      });

      const ids = result.current.lines.map(l => l.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
