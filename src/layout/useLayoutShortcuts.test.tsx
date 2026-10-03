// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useLayoutShortcuts } from './useLayoutShortcuts';

const setup = (enabled = true) => {
  const handlers = {
    onFocusPane: vi.fn(),
    onToggleZoom: vi.fn(),
    onCyclePreset: vi.fn(),
    onEscape: vi.fn(),
  };
  const view = renderHook(
    ({ on }) => {
      useLayoutShortcuts(on, handlers);
    },
    { initialProps: { on: enabled } },
  );
  return { handlers, ...view };
};

const alt = (code: string, extra: KeyboardEventInit = {}) => {
  fireEvent.keyDown(window, { altKey: true, code, key: 'Dead', ...extra });
};

describe('useLayoutShortcuts', () => {
  it.each([
    ['Digit1', 'term'],
    ['Digit2', 'files'],
    ['Digit3', 'doc'],
    ['Digit4', 'aux'],
    ['Digit5', 'comms'],
  ])('Alt+%s focuses %s (matched by code, not by the macOS special character)', (code, pane) => {
    const { handlers } = setup();
    alt(code, { key: '¡' });
    expect(handlers.onFocusPane).toHaveBeenCalledWith(pane);
  });

  it('Alt+Z zooms and Alt+P cycles presets', () => {
    const { handlers } = setup();
    alt('KeyZ');
    alt('KeyP');
    expect(handlers.onToggleZoom).toHaveBeenCalledTimes(1);
    expect(handlers.onCyclePreset).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onEscape', () => {
    const { handlers } = setup();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(handlers.onEscape).toHaveBeenCalledTimes(1);
  });

  it('ignores Ctrl/Meta/Shift combinations and plain keys', () => {
    const { handlers } = setup();
    alt('Digit1', { ctrlKey: true });
    alt('KeyZ', { metaKey: true });
    alt('KeyP', { shiftKey: true });
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ' });
    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    expect(handlers.onFocusPane).not.toHaveBeenCalled();
    expect(handlers.onToggleZoom).not.toHaveBeenCalled();
    expect(handlers.onCyclePreset).not.toHaveBeenCalled();
  });

  it('ignores Alt+6 and unrelated Alt keys', () => {
    const { handlers } = setup();
    alt('Digit6');
    alt('Digit0');
    alt('KeyQ');
    expect(handlers.onFocusPane).not.toHaveBeenCalled();
  });

  it('does nothing while disabled, and resumes when re-enabled', () => {
    const { handlers, rerender } = setup(false);
    alt('KeyZ');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(handlers.onToggleZoom).not.toHaveBeenCalled();
    expect(handlers.onEscape).not.toHaveBeenCalled();
    rerender({ on: true });
    alt('KeyZ');
    expect(handlers.onToggleZoom).toHaveBeenCalledTimes(1);
  });

  it('prevents the default action of handled shortcuts only', () => {
    setup();
    const handled = new KeyboardEvent('keydown', { altKey: true, code: 'KeyZ', cancelable: true });
    window.dispatchEvent(handled);
    expect(handled.defaultPrevented).toBe(true);
    const other = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', cancelable: true });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });
});
