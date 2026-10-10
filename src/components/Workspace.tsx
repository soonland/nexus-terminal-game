import type { ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { GameFile, GameState } from '../types/game';
import { cyclePreset, focusPane, setRatio, toggleZoom } from '../layout/layoutTree';
import type { LayoutState, PaneId, TreePath } from '../layout/layoutTree';
import { loadLayout, saveLayout } from '../layout/layoutPersistence';
import { useLayoutShortcuts } from '../layout/useLayoutShortcuts';
import { useUnread } from '../layout/useUnread';
import { NARROW_WIDTH, useViewportWidth } from '../layout/useViewportWidth';
import { LayoutRoot } from '../layout/LayoutRoot';
import { StatusBar } from '../layout/StatusBar';
import { Overlay } from './Overlay';
import { FilesPane } from './FilesPane';
import { DocPane } from './DocPane';
import { CasePane } from './CasePane';
import { MailPane } from './MailPane';
import type { MailView } from './MailPane';
import { mailActivity } from '../engine/mail';
import { CamPane } from './CamPane';
import { cameraFeeds } from '../engine/cameras';
import { availableAuxTabs, resolveAuxTab } from '../layout/auxTabs';
import type { AuxTab } from '../layout/auxTabs';
import { casebookActivity } from '../engine/casebook';
import { catCommand, sourceSelection } from './explorerShared';
import type { Root, Selection } from './explorerShared';

export type OverlayKind = 'help' | 'briefing' | 'dossier';
export type { AuxTab };

export interface WorkspaceHandle {
  showOverlay: (kind: OverlayKind) => void;
  showAux: (tab: AuxTab) => void;
  // Selects the MAIL tab and the mailbox/message it shows; focuses aux only if it is off screen.
  showMail: (ownerId: string, messageId?: string) => void;
  focusPane: (pane: PaneId) => void;
}

interface Props {
  terminal: ReactNode;
  gameState: GameState | null;
  nodeIp: string;
  trace: number;
  map: ReactNode;
  help: ReactNode;
  briefing: ReactNode;
  dossier: ReactNode;
  explorerDisabled: boolean;
  onRunCommand: (cmd: string) => void;
  onTerminalFocused: () => void;
  // The comms pane is injected: App owns the channel state.
  comms: ReactNode;
  commsAlert: boolean;
  // Running count of things that have arrived in COMMS; drives the unread marker.
  commsActivity: number;
  onCommsFocused: () => void;
  onOpenMailbox: (ownerId: string) => void;
  onReadMail: (messageId: string) => void;
}

const OVERLAY_TITLES: Record<OverlayKind, string> = {
  help: 'COMMAND REFERENCE',
  briefing: 'OPERATIVE ACTIVATION NOTICE',
  dossier: 'DOSSIER',
};

// Debounce localStorage writes so a divider drag (many pointer events) does not write
// dozens of times per second.
export const PERSIST_DEBOUNCE_MS = 250;

export const Workspace = forwardRef<WorkspaceHandle, Props>(
  (
    {
      terminal,
      gameState,
      nodeIp,
      trace,
      map,
      help,
      briefing,
      dossier,
      explorerDisabled,
      onRunCommand,
      onTerminalFocused,
      comms,
      commsAlert,
      commsActivity,
      onCommsFocused,
      onOpenMailbox,
      onReadMail,
    },
    ref,
  ) => {
    const [layout, setLayout] = useState<LayoutState>(() => loadLayout());
    const [overlay, setOverlay] = useState<OverlayKind | null>(null);
    const [auxTab, setAuxTab] = useState<AuxTab>('map');
    const feeds = gameState ? cameraFeeds(gameState) : [];
    const hasCam = feeds.length > 0;
    const shownAuxTab = resolveAuxTab(auxTab, hasCam);
    // Forget a CAM selection once the feeds are gone, so returning to the node does not reopen it.
    useEffect(() => {
      if (!hasCam) setAuxTab(prev => resolveAuxTab(prev, false));
    }, [hasCam]);
    const [selection, setSelection] = useState<Selection | null>(null);
    const narrow = useViewportWidth() < NARROW_WIDTH;
    const [mailView, setMailView] = useState<MailView>({ ownerId: null, messageId: null });
    // Workspace outlives a game: forget the open mailbox when a new run starts.
    const [mailRunId, setMailRunId] = useState(gameState?.runId ?? null);
    if (mailRunId !== (gameState?.runId ?? null)) {
      setMailRunId(gameState?.runId ?? null);
      setMailView({ ownerId: null, messageId: null });
    }
    const auxOnScreenRef = useRef(true);
    const noGame = gameState === null;
    const commsUnread = useUnread(
      commsActivity,
      layout.focused === 'comms',
      gameState?.runId ?? null,
      (gameState?.turnCount ?? 0) > 0,
    );

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
        showMail: (ownerId, messageId) => {
          setAuxTab('mail');
          setMailView({ ownerId, messageId: messageId ?? null });
          if (!auxOnScreenRef.current) focus('aux');
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

    // The CASE tab counts as "being looked at" when it is the selected aux tab and the aux pane
    // is actually on screen (not hidden behind another pane's zoom, or another narrow tab).
    const auxOnScreen = narrow
      ? layout.focused === 'aux'
      : layout.zoomed === null || layout.zoomed === 'aux';
    useEffect(() => {
      auxOnScreenRef.current = auxOnScreen;
    });
    const caseVisible =
      shownAuxTab === 'case' &&
      (narrow ? layout.focused === 'aux' : layout.zoomed === null || layout.zoomed === 'aux');
    const caseUnread = useUnread(
      gameState ? casebookActivity(gameState) : 0,
      caseVisible,
      gameState?.runId ?? null,
      true,
    );

    const mailVisible =
      shownAuxTab === 'mail' &&
      (narrow ? layout.focused === 'aux' : layout.zoomed === null || layout.zoomed === 'aux');
    const mailUnread = useUnread(
      gameState ? mailActivity(gameState) : 0,
      mailVisible,
      gameState?.runId ?? null,
      true,
    );

    const camVisible = narrow
      ? layout.focused === 'aux'
      : layout.zoomed === null || layout.zoomed === 'aux';
    // A camera going live is news for the aux pane, like a new case entry: unread until the CAM tab
    // is actually on screen. A resumed run starts read.
    const camUnread = useUnread(
      feeds.filter(f => f.live).length,
      shownAuxTab === 'cam' && camVisible,
      gameState?.runId ?? null,
      true,
    );
    const auxUnread = caseUnread || camUnread || mailUnread;
    const camFullscreen = layout.zoomed === 'aux';
    const toggleCamFullscreen = () => {
      setLayout(prev =>
        prev.zoomed === 'aux'
          ? { ...prev, zoomed: null }
          : { ...prev, focused: 'aux', zoomed: 'aux' },
      );
    };

    // A casebook source opens in the doc pane (when the file can be opened from here).
    const openSource = useCallback(
      (source: { nodeId: string; path: string }) => {
        if (!gameState) return;
        const next = sourceSelection(gameState, source);
        if (!next) return;
        setSelection(next);
        focus('doc');
      },
      [gameState, focus],
    );

    const openFile = useCallback(
      (root: Root, file: GameFile) => {
        onRunCommand(catCommand(root, file));
      },
      [onRunCommand],
    );

    const auxTabs = (
      <span className="aux-tabs">
        {availableAuxTabs(hasCam).map(tab => (
          <button
            key={tab}
            type="button"
            aria-pressed={shownAuxTab === tab}
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
      aux:
        shownAuxTab === 'map' ? (
          map
        ) : shownAuxTab === 'cam' ? (
          <CamPane
            feeds={feeds}
            visible={camVisible}
            fullscreen={camFullscreen}
            onToggleFullscreen={toggleCamFullscreen}
          />
        ) : shownAuxTab === 'mail' ? (
          gameState && (
            <MailPane
              gameState={gameState}
              view={mailView}
              onView={setMailView}
              onOpenMailbox={onOpenMailbox}
              onRead={onReadMail}
              onOpenSource={openSource}
            />
          )
        ) : (
          gameState && <CasePane gameState={gameState} onOpenSource={openSource} />
        ),
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
          unread={{ comms: commsUnread, aux: auxUnread }}
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
            unread={[
              ...(auxUnread ? (['aux'] as const) : []),
              ...(commsUnread ? (['comms'] as const) : []),
            ]}
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
