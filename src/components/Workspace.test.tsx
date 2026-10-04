// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef, useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Workspace, PERSIST_DEBOUNCE_MS } from './Workspace';
import { CommsPane, INTERRUPT_MS } from './CommsPane';
import type { WorkspaceHandle } from './Workspace';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import { fileReadKey } from '../types/game';
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
  const onCommsFocused = vi.fn();
  const view = render(
    <Workspace
      ref={ref}
      terminal={<input aria-label="term-input" />}
      gameState={withFile()}
      nodeIp="10.0.0.1"
      trace={14}
      map={<div>map-content</div>}
      help={<div>help-content</div>}
      briefing={<div>briefing-content</div>}
      dossier={<div>dossier-content</div>}
      explorerDisabled={false}
      onRunCommand={onRunCommand}
      onTerminalFocused={onTerminalFocused}
      comms={<div>comms-content</div>}
      commsAlert={false}
      commsActivity={0}
      onCommsFocused={onCommsFocused}
      {...over}
    />,
  );
  return { ref, onRunCommand, onTerminalFocused, onCommsFocused, ...view };
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
  it('renders the terminal alone: bare pane, no tabs, status bar or shortcuts', () => {
    setup({ gameState: null });
    expect(screen.getByLabelText('term-input')).toBeTruthy();
    expect(section('term').style.display).toBe('flex');
    for (const id of ['files', 'doc', 'aux', 'comms']) {
      expect(section(id).style.display).toBe('none');
    }
    expect(document.querySelector('.layout-bare')).toBeTruthy();
    expect(document.querySelector('.statusbar')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    alt('Digit3');
    alt('KeyZ');
    expect(section('term').style.display).toBe('flex');
    expect(section('doc').style.display).toBe('none');
  });

  it('shows no tab strip even on a narrow screen', () => {
    vi.stubGlobal('innerWidth', 700);
    setup({ gameState: null });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

describe('Workspace — game starting and ending', () => {
  const mounts = { n: 0 };
  const Probe = () => {
    useEffect(() => {
      mounts.n += 1;
    }, []);
    return <input aria-label="term-input" />;
  };

  const renderWorkspace = (gameState: GameState | null) => (
    <Workspace
      terminal={<Probe />}
      gameState={gameState}
      nodeIp="10.0.0.1"
      trace={0}
      map={<div>map-content</div>}
      help={<div>help-content</div>}
      briefing={<div>briefing-content</div>}
      dossier={<div>dossier-content</div>}
      explorerDisabled={false}
      onRunCommand={vi.fn()}
      onTerminalFocused={vi.fn()}
      comms={<div>comms-content</div>}
      commsAlert={false}
      commsActivity={0}
      onCommsFocused={vi.fn()}
    />
  );

  it('does not re-mount the terminal when a game starts or ends', () => {
    mounts.n = 0;
    const { rerender } = render(renderWorkspace(null));
    rerender(renderWorkspace(withFile()));
    rerender(renderWorkspace(null));
    rerender(renderWorkspace(withFile()));
    expect(mounts.n).toBe(1);
  });

  it('does not bring back an overlay that was open when the game ended', () => {
    const ref = createRef<WorkspaceHandle>();
    const withRef = (g: GameState | null) => (
      <Workspace
        ref={ref}
        terminal={<input aria-label="term-input" />}
        gameState={g}
        nodeIp="10.0.0.1"
        trace={0}
        map={<div>map-content</div>}
        help={<div>help-content</div>}
        briefing={<div>briefing-content</div>}
        dossier={<div>dossier-content</div>}
        explorerDisabled={false}
        onRunCommand={vi.fn()}
        onTerminalFocused={vi.fn()}
        comms={<div>comms-content</div>}
        commsAlert={false}
        commsActivity={0}
        onCommsFocused={vi.fn()}
      />
    );
    const { rerender } = render(withRef(withFile()));
    act(() => {
      ref.current?.showOverlay('help');
    });
    expect(screen.getByText('help-content')).toBeTruthy();
    rerender(withRef(null));
    expect(screen.queryByText('help-content')).toBeNull();
    rerender(withRef(withFile()));
    expect(screen.queryByText('help-content')).toBeNull();
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
    expect(screen.getByText('comms-content')).toBeTruthy();
  });

  it('starts with the map tab in aux and switches to the casebook via the tab button', () => {
    setup();
    expect(screen.getByText('map-content')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^PEOPLE/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CASE' }));
    expect(screen.getByRole('button', { name: /^PEOPLE/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'NOTES' })).toBeNull();
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
      ref.current?.showAux('case');
    });
    expect(screen.getByRole('button', { name: /^PEOPLE/ })).toBeTruthy();
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

  const nudgeRootDivider = () => {
    fireEvent.keyDown(screen.getAllByRole('separator')[0], { key: 'ArrowLeft' });
  };
  const lastSavedHuntRatio = () => {
    const call = storage.setItem.mock.calls.at(-1);
    const saved = JSON.parse(call?.[1] as string) as { trees: { hunt: { ratio: number } } };
    return saved.trees.hunt.ratio;
  };

  it('flushes a pending layout change on pagehide, before the debounce fires', () => {
    vi.useFakeTimers();
    setup();
    act(() => {
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    });
    storage.setItem.mockClear();
    nudgeRootDivider();
    expect(storage.setItem).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(lastSavedHuntRatio()).toBeCloseTo(0.6, 5);
  });

  it('flushes a pending layout change when the workspace unmounts', () => {
    vi.useFakeTimers();
    const { unmount } = setup();
    act(() => {
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    });
    storage.setItem.mockClear();
    nudgeRootDivider();
    unmount();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(lastSavedHuntRatio()).toBeCloseTo(0.6, 5);
  });
});

describe('Workspace — comms', () => {
  it('marks the comms pane in alert only when commsAlert is set', () => {
    setup({ commsAlert: true });
    expect(section('comms').dataset.alert).toBe('true');
    expect(section('term').dataset.alert).toBe('false');
  });

  it('calls onCommsFocused when comms takes focus, not when other panes do', () => {
    const { onCommsFocused } = setup();
    onCommsFocused.mockClear();
    alt('Digit3');
    expect(onCommsFocused).not.toHaveBeenCalled();
    alt('Digit5');
    expect(onCommsFocused).toHaveBeenCalledTimes(1);
  });

  it('does not call onCommsFocused while an overlay is open', () => {
    const { ref, onCommsFocused } = setup();
    act(() => {
      ref.current?.focusPane('comms');
    });
    onCommsFocused.mockClear();
    act(() => {
      ref.current?.showOverlay('help');
    });
    expect(onCommsFocused).not.toHaveBeenCalled();
  });

  it('focusPane("comms") via the handle focuses the comms pane', () => {
    const { ref } = setup();
    act(() => {
      ref.current?.focusPane('comms');
    });
    expect(section('comms').dataset.focused).toBe('true');
  });
});

describe('Workspace — comms focus during the first-contact interruption', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  const renderWithComms = (established: boolean, key: number) => (
    <Workspace
      terminal={<input aria-label="term-input" />}
      gameState={withFile()}
      nodeIp="10.0.0.1"
      trace={0}
      map={<div>map-content</div>}
      help={<div>help-content</div>}
      briefing={<div>briefing-content</div>}
      dossier={<div>dossier-content</div>}
      explorerDisabled={false}
      onRunCommand={vi.fn()}
      onTerminalFocused={() => {
        screen.getByLabelText('term-input').focus();
      }}
      comms={
        <CommsPane
          sentinelEstablished={established}
          sentinelOpen={established}
          sentinelLines={[]}
          sentinelBusy={false}
          interruptKey={key}
          onSend={vi.fn()}
        />
      }
      commsAlert={established}
      commsActivity={0}
      onCommsFocused={vi.fn()}
    />
  );

  it('does not pull focus back to comms if the player moved to the terminal meanwhile', () => {
    vi.useFakeTimers();
    const { rerender } = render(renderWithComms(false, 0));
    rerender(renderWithComms(true, 1));
    alt('Digit5'); // App focuses comms when the channel opens
    alt('Digit1'); // the player goes back to the terminal during the interruption
    expect(document.activeElement).toBe(screen.getByLabelText('term-input'));
    act(() => {
      vi.advanceTimersByTime(INTERRUPT_MS);
    });
    expect(screen.getByTestId('comms-input')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('term-input'));
  });

  it('focuses the comms input when the interruption ends and comms is still the focused pane', () => {
    vi.useFakeTimers();
    const { rerender } = render(renderWithComms(false, 0));
    rerender(renderWithComms(true, 1));
    alt('Digit5');
    act(() => {
      vi.advanceTimersByTime(INTERRUPT_MS);
    });
    expect(document.activeElement).toBe(screen.getByTestId('comms-input'));
  });
});

describe('Workspace — unread comms marker', () => {
  const marked = () => section('comms').getAttribute('data-unread') === 'true';

  it('a new game starts with the opening message unread, and focusing comms reads it', () => {
    setup({ commsActivity: 1 });
    expect(marked()).toBe(true);
    expect(screen.getByText('5:comms!')).toBeTruthy();
    alt('Digit5');
    expect(marked()).toBe(false);
  });

  it('a resumed game starts read, and new traffic while elsewhere marks comms', () => {
    const resumed = produce(withFile(), s => {
      s.turnCount = 12;
    });
    const view = setup({ commsActivity: 2, gameState: resumed });
    expect(marked()).toBe(false);
    view.rerender(
      <Workspace
        ref={view.ref}
        terminal={<input aria-label="term-input" />}
        gameState={resumed}
        nodeIp="10.0.0.1"
        trace={14}
        map={<div>map-content</div>}
        help={<div>help-content</div>}
        briefing={<div>briefing-content</div>}
        dossier={<div>dossier-content</div>}
        explorerDisabled={false}
        onRunCommand={view.onRunCommand}
        onTerminalFocused={view.onTerminalFocused}
        comms={<div>comms-content</div>}
        commsAlert={false}
        commsActivity={3}
        onCommsFocused={view.onCommsFocused}
      />,
    );
    expect(marked()).toBe(true);
  });
});

describe('Workspace — the casebook', () => {
  const KESSLER = '/var/db/hr/terminated/kessler_h_2024-03.txt';
  const base = (): GameState =>
    produce(createInitialState(), s => {
      s.network.currentNodeId = 'ops_hr_db';
      s.network.nodes['ops_hr_db']!.accessLevel = 'user';
      s.network.nodes['ops_hr_db']!.discovered = true;
      s.turnCount = 5;
    });
  // The same run (same runId) with one more document read; a new runId would be a new game.
  const withRead = (state: GameState): GameState =>
    produce(state, s => {
      s.filesRead.push(fileReadKey('ops_hr_db', KESSLER));
    });

  const element = (state: GameState) => (
    <Workspace
      terminal={<input aria-label="term-input" />}
      gameState={state}
      nodeIp="10.1.0.2"
      trace={0}
      map={<div>map-content</div>}
      help={<div>help-content</div>}
      briefing={<div>briefing-content</div>}
      dossier={<div>dossier-content</div>}
      explorerDisabled={false}
      onRunCommand={vi.fn()}
      onTerminalFocused={vi.fn()}
      comms={<div>comms-content</div>}
      commsAlert={false}
      commsActivity={0}
      onCommsFocused={vi.fn()}
    />
  );

  it('marks the aux pane when something new is learned while the map is showing', () => {
    const start = base();
    const view = render(element(start));
    expect(section('aux').getAttribute('data-unread')).toBe('false');
    view.rerender(element(withRead(start)));
    expect(section('aux').getAttribute('data-unread')).toBe('true');
    expect(screen.getByText(/4:aux!/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'CASE' }));
    expect(section('aux').getAttribute('data-unread')).toBe('false');
  });

  it('does not mark the pane for things learned while the CASE tab is open', () => {
    const start = base();
    const view = render(element(start));
    fireEvent.click(screen.getByRole('button', { name: 'CASE' }));
    view.rerender(element(withRead(start)));
    expect(section('aux').getAttribute('data-unread')).toBe('false');
  });

  it('selecting a source in the casebook opens that file in the doc pane', () => {
    render(element(withRead(base())));
    fireEvent.click(screen.getByRole('button', { name: 'CASE' }));
    fireEvent.click(screen.getAllByRole('button', { name: /kessler_h_2024-03\.txt/ })[0]);
    expect(section('doc').textContent).toContain('kessler_h_2024-03.txt');
    expect(section('doc').textContent).toContain('HR SEPARATION RECORD');
  });
});
