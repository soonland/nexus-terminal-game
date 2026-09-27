// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';
import { Desktop } from './Desktop';
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
      onTerminalFocused={onTerminalFocused}
    />,
  );
  return ref;
};

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

  it('persists layout changes made by opening a window (not just move/resize/minimize/close)', () => {
    const ref = renderDesktop();
    mockStorage.setItem.mockClear(); // ignore any writes from the initial mount
    act(() => {
      ref.current?.openWindow('map');
    });
    expect(mockStorage.setItem).toHaveBeenCalled();
    const lastCall = mockStorage.setItem.mock.calls[mockStorage.setItem.mock.calls.length - 1];
    const [, savedRaw] = lastCall;
    const saved = JSON.parse(savedRaw) as { windows: { map: { open: boolean } } };
    expect(saved.windows.map.open).toBe(true);
  });

  it('opening a window via the taskbar shows it', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    expect(screen.getByText('map-content')).toBeTruthy();
  });

  it('minimizing a window via its own button hides it but keeps the taskbar entry', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    fireEvent.click(screen.getByLabelText('Minimize NETWORK MAP'));
    expect(screen.queryByText('map-content')).toBeNull();
    expect(screen.getByText('NETWORK MAP')).toBeTruthy();
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

  it('re-clamps windows when the browser window is resized', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    const mapWindow = screen.getByText('map-content').closest('.window') as HTMLElement;
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
