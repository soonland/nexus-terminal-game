// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';
import { Desktop, PERSIST_DEBOUNCE_MS } from './Desktop';
import type { DesktopHandle } from './Desktop';

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

const renderDesktop = (onTerminalFocused = vi.fn()) => {
  const ref = createRef<DesktopHandle>();
  render(
    <Desktop
      ref={ref}
      terminal={<div>terminal-content</div>}
      map={<div>map-content</div>}
      notes={<div>notes-content</div>}
      help={<div>help-content</div>}
      briefing={<div>briefing-content</div>}
      dossier={<div>dossier-content</div>}
      explorer={<div>explorer-content</div>}
      onTerminalFocused={onTerminalFocused}
    />,
  );
  return ref;
};

const dragTitleBarBy = (windowEl: HTMLElement, dx: number, dy: number) => {
  const titlebar = windowEl.querySelector('.window-titlebar') as HTMLElement;
  fireEvent.pointerDown(titlebar, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(window, { clientX: dx, clientY: dy });
  fireEvent.pointerUp(window);
};

// Once a window is open, its title also appears in the window's own title bar, not
// just its taskbar entry — scope to the taskbar button specifically to disambiguate.
const taskbarEntry = (title: string) =>
  screen.getByText(title, { selector: 'button.taskbar-entry' });

describe('Desktop', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 800);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('always renders the terminal', () => {
    renderDesktop();
    expect(screen.getByText('terminal-content')).toBeTruthy();
  });

  it('does not render non-terminal windows until opened', () => {
    renderDesktop();
    expect(screen.queryByText('map-content')).toBeNull();
  });

  it('opens a window via the exposed handle', () => {
    const ref = renderDesktop();
    act(() => {
      ref.current?.openWindow('map');
    });
    expect(screen.getByText('map-content')).toBeTruthy();
  });

  it('opens the explorer window via the handle and shows its taskbar entry', () => {
    const ref = renderDesktop();
    expect(screen.queryByText('explorer-content')).toBeNull();
    act(() => {
      ref.current?.openWindow('explorer');
    });
    expect(screen.getByText('explorer-content')).toBeTruthy();
    expect(taskbarEntry('FILE EXPLORER')).toBeTruthy();
  });

  it('opening an already-open window via the handle does not duplicate it', () => {
    const ref = renderDesktop();
    act(() => {
      ref.current?.openWindow('map');
    });
    act(() => {
      ref.current?.openWindow('map');
    });
    expect(screen.getAllByText('map-content')).toHaveLength(1);
  });

  it('persists layout changes made by opening a window (not just move/resize/minimize/close), debounced', () => {
    vi.useFakeTimers();
    const ref = renderDesktop();
    mockStorage.setItem.mockClear(); // ignore any writes from the initial mount
    act(() => {
      ref.current?.openWindow('map');
    });
    expect(mockStorage.setItem).not.toHaveBeenCalled(); // debounced, not immediate
    act(() => {
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    });
    expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
    const [, savedRaw] = mockStorage.setItem.mock.calls[0];
    const saved = JSON.parse(savedRaw) as { windows: { map: { open: boolean } } };
    expect(saved.windows.map.open).toBe(true);
  });

  it('does not persist a viewport-resize re-clamp at all, even after the debounce window', () => {
    vi.useFakeTimers();
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    const mapWindow = screen.getByText('map-content').closest('.window') as HTMLElement;
    act(() => {
      dragTitleBarBy(mapWindow, 1100, 700);
    });
    act(() => {
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS); // flush the drag's own (legitimate) save
    });
    mockStorage.setItem.mockClear();
    act(() => {
      vi.stubGlobal('innerWidth', 300);
      vi.stubGlobal('innerHeight', 300);
      window.dispatchEvent(new Event('resize'));
    });
    act(() => {
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS * 2);
    });
    expect(mockStorage.setItem).not.toHaveBeenCalled();
  });

  it('opening a window via the taskbar shows it', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    expect(screen.getByText('map-content')).toBeTruthy();
  });

  it('clicking the taskbar entry of an open-but-unfocused window brings it to the front', () => {
    renderDesktop();
    fireEvent.click(taskbarEntry('NETWORK MAP')); // open+focus map
    fireEvent.click(taskbarEntry('OPERATIVE NOTES')); // open+focus notes (now on top)
    // Map is open but no longer focused — its taskbar entry must still focus it.
    fireEvent.click(taskbarEntry('NETWORK MAP'));
    expect(taskbarEntry('NETWORK MAP').getAttribute('data-state')).toBe('focused');
  });

  it('minimizing a window via its own button hides it but keeps the taskbar entry', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    fireEvent.click(screen.getByLabelText('Minimize NETWORK MAP'));
    expect(screen.queryByText('map-content')).toBeNull();
    expect(screen.getByText('NETWORK MAP')).toBeTruthy();
  });

  it('restoring a minimized window via its taskbar entry shows it again', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    fireEvent.click(screen.getByLabelText('Minimize NETWORK MAP'));
    expect(screen.queryByText('map-content')).toBeNull();
    fireEvent.click(screen.getByText('NETWORK MAP')); // taskbar entry, now showing 'minimized'
    expect(screen.getByText('map-content')).toBeTruthy();
  });

  it('closing a window via its own button removes it (and marks its taskbar entry closed)', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    fireEvent.click(screen.getByLabelText('Close NETWORK MAP'));
    expect(screen.queryByText('map-content')).toBeNull();
    expect(screen.getByText('NETWORK MAP').getAttribute('data-state')).toBe('closed');
  });

  it('the terminal window has no minimize/close buttons', () => {
    renderDesktop();
    expect(screen.queryByLabelText('Minimize TERMINAL')).toBeNull();
    expect(screen.queryByLabelText('Close TERMINAL')).toBeNull();
  });

  it('calls onTerminalFocused when the terminal becomes the focused window', () => {
    const onTerminalFocused = vi.fn();
    renderDesktop(onTerminalFocused);
    onTerminalFocused.mockClear(); // ignore the initial-mount call
    fireEvent.click(screen.getByText('NETWORK MAP')); // focuses map instead
    fireEvent.pointerDown(screen.getByText('terminal-content')); // click back into terminal
    expect(onTerminalFocused).toHaveBeenCalled();
  });

  it('minimizing the focused window returns focus to the terminal, scoped to visible windows only', () => {
    // Regression test for the isTopVisible fix: map keeps a *stale, higher* raw
    // z-index after being minimized (minimizing doesn't change z-index). If
    // "focused" were computed from the max z-index across ALL windows (including
    // minimized ones) instead of visible ones only, terminal would never be
    // recognized as focused here, since map's stale z-index would still "win".
    const onTerminalFocused = vi.fn();
    renderDesktop(onTerminalFocused);
    onTerminalFocused.mockClear();
    fireEvent.click(screen.getByText('NETWORK MAP')); // map now has the highest raw z-index
    onTerminalFocused.mockClear();
    fireEvent.click(screen.getByLabelText('Minimize NETWORK MAP'));
    expect(onTerminalFocused).toHaveBeenCalled();
  });

  it('closing the focused window returns focus to the terminal', () => {
    const onTerminalFocused = vi.fn();
    renderDesktop(onTerminalFocused);
    onTerminalFocused.mockClear();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    onTerminalFocused.mockClear();
    fireEvent.click(screen.getByLabelText('Close NETWORK MAP'));
    expect(onTerminalFocused).toHaveBeenCalled();
  });

  it('focusing a non-terminal window by clicking it changes which taskbar entry shows "focused"', () => {
    renderDesktop();
    fireEvent.click(taskbarEntry('NETWORK MAP'));
    fireEvent.click(taskbarEntry('OPERATIVE NOTES')); // notes now on top
    expect(taskbarEntry('OPERATIVE NOTES').getAttribute('data-state')).toBe('focused');
    expect(taskbarEntry('NETWORK MAP').getAttribute('data-state')).toBe('open');
    // Click back into map's own body (not its taskbar entry) to focus it.
    fireEvent.pointerDown(screen.getByText('map-content'));
    expect(taskbarEntry('NETWORK MAP').getAttribute('data-state')).toBe('focused');
    expect(taskbarEntry('OPERATIVE NOTES').getAttribute('data-state')).toBe('open');
  });

  it('pressing Escape closes the topmost visible non-terminal window and refocuses the terminal', () => {
    const onTerminalFocused = vi.fn();
    renderDesktop(onTerminalFocused);
    fireEvent.click(screen.getByText('NETWORK MAP'));
    onTerminalFocused.mockClear();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('map-content')).toBeNull();
    expect(onTerminalFocused).toHaveBeenCalled();
  });

  it('pressing Escape with only the terminal open does nothing', () => {
    renderDesktop();
    expect(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    }).not.toThrow();
    expect(screen.getByText('terminal-content')).toBeTruthy();
  });

  it('re-clamps windows when the browser window is resized', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    const mapWindow = screen.getByText('map-content').closest('.window') as HTMLElement;
    // Move the window near the far edge first — its default position (56, 56) is
    // already inside a shrunken 300x300 viewport, which would make this test pass
    // even if the resize listener were removed entirely.
    dragTitleBarBy(mapWindow, 1100, 700);
    act(() => {
      vi.stubGlobal('innerWidth', 300);
      vi.stubGlobal('innerHeight', 300);
      window.dispatchEvent(new Event('resize'));
    });
    const styleLeft = Number.parseInt(mapWindow.style.left, 10);
    const styleTop = Number.parseInt(mapWindow.style.top, 10);
    expect(styleLeft).toBeLessThan(300);
    expect(styleTop).toBeLessThan(300);
  });
});
