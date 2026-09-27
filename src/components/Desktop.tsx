import type { ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { WindowKind, WindowManagerState, Viewport } from '../engine/windowManager';
import {
  WINDOW_KINDS,
  openWindow,
  closeWindow,
  minimizeWindow,
  restoreWindow,
  focusWindow,
  moveWindow,
  resizeWindow,
  clampInstance,
} from '../engine/windowManager';
import { loadWindowLayout, saveWindowLayout } from '../engine/windowLayoutPersistence';
import { Window } from './Window';
import { Taskbar } from './Taskbar';

interface Props {
  terminal: ReactNode;
  map: ReactNode | null;
  notes: ReactNode | null;
  help: ReactNode;
  briefing: ReactNode;
  dossier: ReactNode;
  onTerminalFocused: () => void;
}

export interface DesktopHandle {
  openWindow: (kind: WindowKind) => void;
}

const TITLES: Record<WindowKind, string> = {
  terminal: 'TERMINAL',
  map: 'NETWORK MAP',
  notes: 'OPERATIVE NOTES',
  help: 'COMMAND REFERENCE',
  briefing: 'OPERATIVE ACTIVATION NOTICE',
  dossier: 'DOSSIER',
};

const ACCENTS: Record<WindowKind, string> = {
  terminal: '#58a6ff',
  map: '#56d364',
  notes: '#e3b341',
  help: '#a371f7',
  briefing: '#f0883e',
  dossier: '#79c0ff',
};

const currentViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

// A minimized/closed window can hold a stale, high z-index (its last time on top);
// "focused" must only be decided among windows actually visible on the desktop.
const isTopVisible = (state: WindowManagerState, kind: WindowKind): boolean => {
  const visible = WINDOW_KINDS.filter(k => state[k].open && !state[k].minimized);
  if (visible.length === 0) return false;
  const maxZ = Math.max(...visible.map(k => state[k].zIndex));
  return state[kind].open && !state[kind].minimized && state[kind].zIndex === maxZ;
};

export const Desktop = forwardRef<DesktopHandle, Props>(
  ({ terminal, map, notes, help, briefing, dossier, onTerminalFocused }, ref) => {
    const [state, setState] = useState<WindowManagerState>(() =>
      loadWindowLayout(currentViewport()),
    );
    const onTerminalFocusedRef = useRef(onTerminalFocused);
    onTerminalFocusedRef.current = onTerminalFocused;

    // Notify once on mount if the terminal starts out focused (it does, by default).
    useEffect(() => {
      if (isTopVisible(state, 'terminal')) onTerminalFocusedRef.current();
      // Intentionally runs once on mount only.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist on every layout change, from every path (open/close/minimize/restore/
    // focus/move/resize) — a handler-by-handler persist() call is too easy to miss,
    // as happened here (opening/restoring/focusing weren't persisted before this).
    useEffect(() => {
      saveWindowLayout(state);
    }, [state]);

    useEffect(() => {
      const handleResize = () => {
        const viewport = currentViewport();
        setState(prev => {
          const next = {} as WindowManagerState;
          for (const kind of WINDOW_KINDS) {
            next[kind] = clampInstance(prev[kind], viewport);
          }
          return next;
        });
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }, []);

    const applyAndMaybeFocusTerminal = useCallback(
      (updater: (prev: WindowManagerState) => WindowManagerState) => {
        setState(prev => {
          const next = updater(prev);
          if (isTopVisible(next, 'terminal') && !isTopVisible(prev, 'terminal')) {
            onTerminalFocusedRef.current();
          }
          return next;
        });
      },
      [],
    );

    const handleOpen = useCallback(
      (kind: WindowKind) => {
        applyAndMaybeFocusTerminal(prev => openWindow(prev, kind));
      },
      [applyAndMaybeFocusTerminal],
    );

    useImperativeHandle(ref, () => ({ openWindow: handleOpen }), [handleOpen]);

    const handleTaskbarClick = useCallback((kind: WindowKind) => {
      setState(prev => {
        const instance = prev[kind];
        if (!instance.open) return openWindow(prev, kind);
        if (instance.minimized) return restoreWindow(prev, kind);
        return prev; // already open and focused/visible — no-op
      });
    }, []);

    const contents: Record<WindowKind, ReactNode | null> = {
      terminal,
      map,
      notes,
      help,
      briefing,
      dossier,
    };

    const visibleKinds = WINDOW_KINDS.filter(
      kind => state[kind].open && !state[kind].minimized && contents[kind] !== null,
    ).sort((a, b) => state[a].zIndex - state[b].zIndex);

    return (
      <div className="desktop">
        {visibleKinds.map(kind => (
          <Window
            key={kind}
            instance={state[kind]}
            title={TITLES[kind]}
            accentColor={ACCENTS[kind]}
            closable={kind !== 'terminal'}
            minimizable={kind !== 'terminal'}
            onFocus={() => {
              applyAndMaybeFocusTerminal(prev => focusWindow(prev, kind));
            }}
            onMove={(x, y) => {
              setState(prev => moveWindow(prev, kind, x, y, currentViewport()));
            }}
            onResize={(width, height) => {
              setState(prev => resizeWindow(prev, kind, width, height, currentViewport()));
            }}
            onMinimize={() => {
              setState(prev => minimizeWindow(prev, kind));
            }}
            onClose={() => {
              setState(prev => closeWindow(prev, kind));
            }}>
            {contents[kind]}
          </Window>
        ))}
        <Taskbar state={state} titles={TITLES} onEntryClick={handleTaskbarClick} />
      </div>
    );
  },
);

Desktop.displayName = 'Desktop';
