// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Workspace, PERSIST_DEBOUNCE_MS } from './Workspace';
import type { WorkspaceHandle } from './Workspace';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import type { GameState } from '../types/game';

const makeStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k);
    }),
  };
};

const withFile = (): GameState =>
  produce(createInitialState(), s => {
    const node = s.network.nodes['contractor_portal']!;
    node.accessLevel = 'user';
    node.files = [
      {
        name: 'vpn.cfg',
        path: '/etc/vpn.cfg',
        type: 'config',
        content: 'VPN BODY',
        exfiltrable: true,
        accessRequired: 'user',
      },
    ];
  });

const setup = (over: Partial<Parameters<typeof Workspace>[0]> = {}) => {
  const ref = createRef<WorkspaceHandle>();
  const onRunCommand = vi.fn();
  const onTerminalFocused = vi.fn();
  render(
    <Workspace
      ref={ref}
      terminal={<input aria-label="term-input" />}
      gameState={withFile()}
      nodeIp="10.0.0.1"
      trace={14}
      map={<div>map-content</div>}
      notes={<div>notes-content</div>}
      help={<div>help-content</div>}
      briefing={<div>briefing-content</div>}
      dossier={<div>dossier-content</div>}
      explorerDisabled={false}
      onRunCommand={onRunCommand}
      onTerminalFocused={onTerminalFocused}
      {...over}
    />,
  );
  return { ref, onRunCommand, onTerminalFocused };
};

const section = (id: string) => document.querySelector<HTMLElement>(`[data-pane="${id}"]`)!;
const alt = (code: string) => {
  fireEvent.keyDown(window, { altKey: true, code, key: 'Dead' });
};

let storage: ReturnType<typeof makeStorage>;

beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('innerWidth', 1400);
  vi.stubGlobal('innerHeight', 900);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Workspace — before a game exists', () => {
  it('renders the terminal alone, with no panes, status bar or shortcuts', () => {
    setup({ gameState: null });
    expect(screen.getByLabelText('term-input')).toBeTruthy();
    expect(document.querySelector('.pane')).toBeNull();
    expect(document.querySelector('.statusbar')).toBeNull();
    alt('KeyZ');
    expect(document.querySelector('.pane')).toBeNull();
  });
});

describe('Workspace — tiled', () => {
  it('shows all five panes and the status bar with node ip and trace', () => {
    setup();
    for (const id of ['term', 'files', 'doc', 'aux', 'comms']) {
      expect(section(id)).toBeTruthy();
    }
    expect(screen.getByText('10.0.0.1')).toBeTruthy();
    expect(screen.getByText('TRC 14%')).toBeTruthy();
    expect(screen.getByText(/nexus \/\/ encrypted line/i)).toBeTruthy();
  });

  it('starts with the map tab in aux and switches to notes via the tab button', () => {
    setup();
    expect(screen.getByText('map-content')).toBeTruthy();
    expect(screen.queryByText('notes-content')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'NOTES' }));
    expect(screen.getByText('notes-content')).toBeTruthy();
  });

  it('shares the explorer selection between the files and doc panes', () => {
    setup();
    expect(screen.getByText(/select a file in the files pane/i)).toBeTruthy();
    fireEvent.click(screen.getByText('vpn.cfg'));
    expect(screen.getByText('/etc/vpn.cfg')).toBeTruthy();
    expect(screen.getByText(/not read yet/i)).toBeTruthy();
  });

  it('runs commands through onRunCommand and honours explorerDisabled', () => {
    const { onRunCommand } = setup();
    fireEvent.doubleClick(screen.getByText('vpn.cfg'));
    expect(onRunCommand).toHaveBeenCalledWith('cat /etc/vpn.cfg');
  });

  it('disables explorer actions when explorerDisabled is true', () => {
    const { onRunCommand } = setup({ explorerDisabled: true });
    fireEvent.doubleClick(screen.getByText('vpn.cfg'));
    expect(onRunCommand).not.toHaveBeenCalled();
  });
});

describe('Workspace — shortcuts and handle', () => {
  it('Alt+3 focuses doc, Alt+Z zooms it, Alt+Z again restores, Alt+P cycles presets', () => {
    setup();
    alt('Digit3');
    expect(section('doc').dataset.focused).toBe('true');
    alt('KeyZ');
    expect(section('term').style.display).toBe('none');
    expect(section('doc').style.display).toBe('flex');
    alt('KeyZ');
    expect(section('term').style.display).toBe('flex');
    alt('KeyP');
    expect(screen.getByText('[analyze]')).toBeTruthy();
  });

  it('Alt+1 focuses the terminal input via onTerminalFocused', () => {
    const { onTerminalFocused } = setup();
    onTerminalFocused.mockClear();
    alt('Digit3');
    alt('Digit1');
    expect(onTerminalFocused).toHaveBeenCalled();
  });

  it('Escape from comms returns focus to the terminal', () => {
    setup();
    alt('Digit5');
    expect(section('comms').dataset.focused).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(section('term').dataset.focused).toBe('true');
  });

  it('handle.showAux selects the tab and focuses aux; focusPane focuses files', () => {
    const { ref } = setup();
    act(() => {
      ref.current?.showAux('notes');
    });
    expect(screen.getByText('notes-content')).toBeTruthy();
    expect(section('aux').dataset.focused).toBe('true');
    act(() => {
      ref.current?.focusPane('files');
    });
    expect(section('files').dataset.focused).toBe('true');
  });
});

describe('Workspace — overlays', () => {
  it('opens each overlay via the handle and closes it with Escape', () => {
    const { ref } = setup();
    for (const [kind, text] of [
      ['help', 'help-content'],
      ['briefing', 'briefing-content'],
      ['dossier', 'dossier-content'],
    ] as const) {
      act(() => {
        ref.current?.showOverlay(kind);
      });
      expect(screen.getByText(text)).toBeTruthy();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText(text)).toBeNull();
    }
  });

  it('disables pane shortcuts while an overlay is open and refocuses the terminal on close', () => {
    const { ref, onTerminalFocused } = setup();
    act(() => {
      ref.current?.showOverlay('help');
    });
    alt('Digit3');
    expect(section('term').dataset.focused).toBe('true');
    onTerminalFocused.mockClear();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onTerminalFocused).toHaveBeenCalled();
  });
});

describe('Workspace — narrow and persistence', () => {
  it('uses the tab strip below the narrow threshold', () => {
    vi.stubGlobal('innerWidth', 700);
    setup();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(section('files').style.display).toBe('none');
    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect(section('files').style.display).toBe('flex');
  });

  it('persists the preset (debounced) but not focus or zoom changes alone', () => {
    vi.useFakeTimers();
    setup();
    act(() => {
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    });
    storage.setItem.mockClear();
    alt('Digit3');
    alt('KeyZ');
    act(() => {
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS * 2);
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    alt('KeyP');
    expect(storage.setItem).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(storage.setItem.mock.calls[0][1]) as { preset: string };
    expect(saved.preset).toBe('analyze');
  });
});
