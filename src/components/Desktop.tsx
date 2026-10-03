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
  toggleMaximizeWindow,
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
  explorer: ReactNode | null;
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
  explorer: 'FILE EXPLORER',
};

const ACCENTS: Record<WindowKind, string> = {
  terminal: '#58a6ff',
  map: '#56d364',
  notes: '#e3b341',
  help: '#a371f7',
  briefing: '#f0883e',
  dossier: '#79c0ff',
  explorer: '#ff7b72',
};

// Debounce localStorage writes so a drag (many pointermove events) or a burst of
// resize events doesn't write dozens of times per second.
export const PERSIST_DEBOUNCE_MS = 250;

const currentViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

// A minimized/closed window can hold a stale, high z-index (its last time on top);
// "focused" must only be decided among windows actually visible on the desktop.
const isTopVisible = (state: WindowManagerState, kind: WindowKind): boolean => {
  const visible = WINDOW_KINDS.filter(k => state[k].open && !state[k].minimized);
  if (visible.length === 0) return false;
  const maxZ = Math.max(...visible.map(k => state[k].zIndex));
  return state[kind].open && !state[kind].minimized && state[kind].zIndex === maxZ;
};

const sameBounds = (
  a: WindowManagerState[WindowKind],
  b: WindowManagerState[WindowKind],
): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

export const Desktop = forwardRef<DesktopHandle, Props>(
  ({ terminal, map, notes, help, briefing, dossier, explorer, onTerminalFocused }, ref) => {
    const [state, setState] = useState<WindowManagerState>(() =>
      loadWindowLayout(currentViewport()),
    );
    const onTerminalFocusedRef = useRef(onTerminalFocused);
    onTerminalFocusedRef.current = onTerminalFocused;

    // A viewport-resize re-clamp must update the rendered layout but must NEVER be
    // persisted on its own (per spec: "not persisted immediately — only
    // user-initiated moves/resizes trigger a save") — this flag tells the
    // persistence effect below to skip exactly the next state change.
    const skipNextPersistRef = useRef(false);

    // Notify once on mount if the terminal starts out focused (it does, by default).
    useEffect(() => {
      if (isTopVisible(state, 'terminal')) onTerminalFocusedRef.current();
      // Intentionally runs once on mount only.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist on every user-initiated layout change, debounced. Centralized here
    // (rather than a handler-by-handler persist() call) so no future state-changing
    // path can forget to persist — that gap is exactly what caused window layout to
    // not survive a real page reload before this was added.
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (skipNextPersistRef.current) {
        skipNextPersistRef.current = false;
        return;
      }
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        saveWindowLayout(state);
      }, PERSIST_DEBOUNCE_MS);
      return () => {
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      };
    }, [state]);

    useEffect(() => {
      const handleResize = () => {
        const viewport = currentViewport();
        setState(prev => {
          const next = {} as WindowManagerState;
          let changed = false;
          for (const kind of WINDOW_KINDS) {
            next[kind] = clampInstance(prev[kind], viewport);
            if (!sameBounds(next[kind], prev[kind])) changed = true;
          }
          if (!changed) return prev;
          skipNextPersistRef.current = true;
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

    const handleTaskbarClick = useCallback(
      (kind: WindowKind) => {
        applyAndMaybeFocusTerminal(prev => {
          const instance = prev[kind];
          if (!instance.open) return openWindow(prev, kind);
          if (instance.minimized) return restoreWindow(prev, kind);
          if (!isTopVisible(prev, kind)) return focusWindow(prev, kind);
          return prev; // already open, visible, and focused — no-op
        });
      },
      [applyAndMaybeFocusTerminal],
    );

    // Escape closes the topmost visible non-terminal window — the keyboard
    // equivalent of the old DosModal's Escape-to-close, lost in the migration to
    // the new chrome (Window has no keyboard close of its own).
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        const closable = WINDOW_KINDS.filter(
          k => k !== 'terminal' && state[k].open && !state[k].minimized,
        );
        if (closable.length === 0) return;
        const topKind = closable.reduce((top, k) =>
          state[k].zIndex > state[top].zIndex ? k : top,
        );
        applyAndMaybeFocusTerminal(prev => closeWindow(prev, topKind));
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [state, applyAndMaybeFocusTerminal]);

    const contents: Record<WindowKind, ReactNode | null> = {
      terminal,
      map,
      notes,
      help,
      briefing,
      dossier,
      explorer,
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
              applyAndMaybeFocusTerminal(prev => minimizeWindow(prev, kind));
            }}
            onToggleMaximize={() => {
              setState(prev => toggleMaximizeWindow(prev, kind, currentViewport()));
            }}
            onClose={() => {
              applyAndMaybeFocusTerminal(prev => closeWindow(prev, kind));
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
