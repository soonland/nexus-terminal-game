import type { ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { GameFile, GameState } from '../types/game';
import { cyclePreset, focusPane, setRatio, toggleZoom } from '../layout/layoutTree';
import type { LayoutState, PaneId, TreePath } from '../layout/layoutTree';
import { loadLayout, saveLayout } from '../layout/layoutPersistence';
import { useLayoutShortcuts } from '../layout/useLayoutShortcuts';
import { NARROW_WIDTH, useViewportWidth } from '../layout/useViewportWidth';
import { LayoutRoot } from '../layout/LayoutRoot';
import { StatusBar } from '../layout/StatusBar';
import { Overlay } from './Overlay';
import { FilesPane } from './FilesPane';
import { DocPane } from './DocPane';
import { catCommand } from './explorerShared';
import type { Root, Selection } from './explorerShared';

export type OverlayKind = 'help' | 'briefing' | 'dossier';
export type AuxTab = 'map' | 'notes';

export interface WorkspaceHandle {
  showOverlay: (kind: OverlayKind) => void;
  showAux: (tab: AuxTab) => void;
  focusPane: (pane: PaneId) => void;
}

interface Props {
  terminal: ReactNode;
  gameState: GameState | null;
  nodeIp: string;
  trace: number;
  map: ReactNode;
  notes: ReactNode;
  help: ReactNode;
  briefing: ReactNode;
  dossier: ReactNode;
  explorerDisabled: boolean;
  onRunCommand: (cmd: string) => void;
  onTerminalFocused: () => void;
  // The comms pane is injected (App owns the channel state). Optional until App passes it.
  comms?: ReactNode;
  commsAlert?: boolean;
  onCommsFocused?: () => void;
}

const OVERLAY_TITLES: Record<OverlayKind, string> = {
  help: 'COMMAND REFERENCE',
  briefing: 'OPERATIVE ACTIVATION NOTICE',
  dossier: 'DOSSIER',
};

// Debounce localStorage writes so a divider drag (many pointer events) does not write
// dozens of times per second.
export const PERSIST_DEBOUNCE_MS = 250;

const noop = () => undefined;

export const Workspace = forwardRef<WorkspaceHandle, Props>(
  (
    {
      terminal,
      gameState,
      nodeIp,
      trace,
      map,
      notes,
      help,
      briefing,
      dossier,
      explorerDisabled,
      onRunCommand,
      onTerminalFocused,
      comms = null,
      commsAlert = false,
      onCommsFocused = noop,
    },
    ref,
  ) => {
    const [layout, setLayout] = useState<LayoutState>(() => loadLayout());
    const [overlay, setOverlay] = useState<OverlayKind | null>(null);
    const [auxTab, setAuxTab] = useState<AuxTab>('map');
    const [selection, setSelection] = useState<Selection | null>(null);
    const narrow = useViewportWidth() < NARROW_WIDTH;
    const noGame = gameState === null;

    const onTerminalFocusedRef = useRef(onTerminalFocused);
    useEffect(() => {
      onTerminalFocusedRef.current = onTerminalFocused;
    });

    // Put the DOM caret in the terminal input only after the terminal pane is actually
    // visible (a zoomed-away pane is display:none and cannot take focus yet).
    const onCommsFocusedRef = useRef(onCommsFocused);
    useEffect(() => {
      onCommsFocusedRef.current = onCommsFocused;
    });

    useEffect(() => {
      if (overlay !== null) return;
      if (layout.focused === 'term') onTerminalFocusedRef.current();
      else if (layout.focused === 'comms') onCommsFocusedRef.current();
    }, [layout.focused, layout.zoomed, overlay, noGame, narrow]);

    // Persist preset and tree changes only — focus and zoom are session state.
    const { preset, trees } = layout;
    useEffect(() => {
      const timer = setTimeout(() => {
        saveLayout({ preset, trees });
      }, PERSIST_DEBOUNCE_MS);
      return () => {
        clearTimeout(timer);
      };
    }, [preset, trees]);

    // A debounced save is lost if the tab closes or reloads inside the window (or the
    // workspace unmounts), so also write the latest layout on pagehide and on unmount.
    const latestLayoutRef = useRef({ preset, trees });
    useEffect(() => {
      latestLayoutRef.current = { preset, trees };
    });
    useEffect(() => {
      const flush = () => {
        saveLayout(latestLayoutRef.current);
      };
      window.addEventListener('pagehide', flush);
      return () => {
        window.removeEventListener('pagehide', flush);
        flush();
      };
    }, []);

    // A stale overlay must not reappear when the next game starts.
    useEffect(() => {
      if (noGame) setOverlay(null);
    }, [noGame]);

    const focus = useCallback((pane: PaneId) => {
      setLayout(prev => focusPane(prev, pane));
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        showOverlay: kind => {
          setOverlay(kind);
        },
        showAux: tab => {
          setAuxTab(tab);
          focus('aux');
        },
        focusPane: focus,
      }),
      [focus],
    );

    useLayoutShortcuts(overlay === null && gameState !== null, {
      onFocusPane: focus,
      onToggleZoom: () => {
        setLayout(toggleZoom);
      },
      onCyclePreset: () => {
        setLayout(cyclePreset);
      },
      onEscape: () => {
        if (layout.focused === 'comms') focus('term');
      },
    });

    const openFile = useCallback(
      (root: Root, file: GameFile) => {
        onRunCommand(catCommand(root, file));
      },
      [onRunCommand],
    );

    const auxTabs = (
      <span className="aux-tabs">
        {(['map', 'notes'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            aria-pressed={auxTab === tab}
            onClick={() => {
              setAuxTab(tab);
            }}>
            {tab.toUpperCase()}
          </button>
        ))}
      </span>
    );

    const panes: Record<PaneId, ReactNode> = {
      term: terminal,
      files: gameState && (
        <FilesPane
          gameState={gameState}
          selection={selection}
          onSelect={setSelection}
          onOpen={openFile}
          disabled={explorerDisabled}
        />
      ),
      doc: gameState && (
        <DocPane
          gameState={gameState}
          selection={selection}
          onRunCommand={onRunCommand}
          disabled={explorerDisabled}
        />
      ),
      aux: auxTab === 'map' ? map : notes,
      comms,
    };

    // Before a game exists (login screens) the terminal is shown alone. It stays in the
    // same keyed pane slot, so starting or ending a game never re-mounts it: only the
    // layout state passed down changes.
    const shownLayout: LayoutState = noGame
      ? { ...layout, focused: 'term', zoomed: 'term' }
      : layout;

    const overlayContent: Record<OverlayKind, ReactNode> = { help, briefing, dossier };

    return (
      <div className={noGame ? 'workspace workspace-solo' : 'workspace'}>
        <LayoutRoot
          state={shownLayout}
          panes={panes}
          headerExtras={{ aux: auxTabs }}
          narrow={narrow && !noGame}
          bare={noGame}
          alerts={{ comms: commsAlert }}
          onFocusPane={focus}
          onRatio={(path: TreePath, ratio: number) => {
            setLayout(prev => setRatio(prev, path, ratio));
          }}
        />
        {!noGame && (
          <StatusBar
            preset={layout.preset}
            focused={layout.focused}
            zoomed={layout.zoomed}
            nodeIp={nodeIp}
            trace={trace}
          />
        )}
        {overlay && !noGame && (
          <Overlay
            title={OVERLAY_TITLES[overlay]}
            onClose={() => {
              setOverlay(null);
            }}>
            {overlayContent[overlay]}
          </Overlay>
        )}
      </div>
    );
  },
);

Workspace.displayName = 'Workspace';
