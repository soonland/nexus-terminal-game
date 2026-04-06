import { useState, useCallback, useEffect, useRef } from 'react';
import { Terminal } from './components/Terminal';
import type { TerminalHandle } from './components/Terminal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { PrologueScreen } from './components/PrologueScreen';
import { ScanDiskScreen } from './components/ScanDiskScreen';
import { BriefingModal } from './components/BriefingModal';
import { MapModal } from './components/MapModal';
import { HelpModal } from './components/HelpModal';
import { NotesModal } from './components/NotesModal';
import { useBootSequence } from './hooks/useBootSequence';
import { useEndingSequence, buildEndingLines } from './hooks/useEndingSequence';
import { buildPostGameReadout } from './engine/postGameReadout';
import type { EndingName } from './hooks/useEndingSequence';
import type { TerminalLine } from './types/terminal';
import { makeLine } from './types/terminal';
import type { GameState } from './types/game';
import { hasAccess } from './types/game';
import { createInitialState, currentNode, burnRetry } from './engine/state';
import { resolveCommand } from './engine/commands';
import {
  saveGame,
  loadGame,
  hasSave,
  clearSave,
  disclaimerRequired,
  recordDisclaimerAgreement,
} from './engine/persistence';

const computeContextSuggestions = (state: GameState): string[] => {
  const node = state.network.nodes[state.network.currentNodeId];
  if (!node) return [];
  const suggestions: string[] = [];

  if (node.accessLevel === 'none') {
    suggestions.push('scan');
    const obtained = state.player.credentials.find(
      c => c.obtained && !c.revoked && c.validOnNodes.includes(node.id),
    );
    if (obtained) {
      suggestions.push(`login ${obtained.username} <password>`);
    }
    const vulnerable = node.services.find(s => s.vulnerable && !s.patched);
    if (vulnerable && state.player.tools.some(t => t.id === 'exploit-kit')) {
      suggestions.push(`exploit ${vulnerable.name}`);
    }
  } else {
    suggestions.push('ls');
    const firstFile = node.files.find(
      f => !f.deleted && !f.locked && hasAccess(node.accessLevel, f.accessRequired),
    );
    if (firstFile) suggestions.push(`cat ${firstFile.name}`);
    const exfilable = node.files.find(
      f =>
        !f.deleted && !f.locked && f.exfiltrable && hasAccess(node.accessLevel, f.accessRequired),
    );
    if (exfilable) suggestions.push(`exfil ${exfilable.name}`);
  }

  if (state.network.previousNodeId) suggestions.push('disconnect');

  if (state.player.tools.some(t => t.id === 'log-wiper') && state.player.trace > 20) {
    suggestions.push('wipe-logs');
  }

  return suggestions.slice(0, 5);
};

const VALID_ENDINGS: ReadonlyArray<EndingName> = ['LEAK', 'SELL', 'DESTROY', 'FREE'];

const getEndingName = (flags: Record<string, boolean>): EndingName | 'UNKNOWN' => {
  const key = Object.keys(flags).find(k => k.startsWith('ending_'));
  if (!key) return 'UNKNOWN';
  const name = key.replace('ending_', '').toUpperCase();
  return (VALID_ENDINGS as readonly string[]).includes(name) ? (name as EndingName) : 'UNKNOWN';
};

// Nexus Corp operative credentials
const OPERATIVE_USER = 'ghost';
const OPERATIVE_PASS = 'nX-2847';

const SPINNER_FRAMES = ['-', '\\', '|', '/'];

type AppPhase =
  | 'welcome'
  | 'prologue'
  | 'login_user'
  | 'login_pass'
  | 'resume_prompt'
  | 'scanning'
  | 'booting'
  | 'playing'
  | 'aria'
  | 'dm'
  | 'burned'
  | 'ending_sequence'
  | 'ended';

export const App = () => {
  const [appPhase, setAppPhase] = useState<AppPhase>(() =>
    disclaimerRequired() ? 'welcome' : 'login_user',
  );

  const [gameState, setGameState] = useState<GameState | null>(null);
  // Snapshot of state at ending choice — used to build post-game readout
  const [endingGameState, setEndingGameState] = useState<GameState | null>(null);
  // Snapshot the boot node label/IP/hint only when entering the booting phase (via ScanDiskScreen
  // onDone). Deriving these live from gameState would cause useBootSequence to re-fire on every
  // connect command (currentNodeId change), triggering unnecessary setLines([]) calls.
  const [bootLabel, setBootLabel] = useState('CONTRACTOR PORTAL');
  const [bootIp, setBootIp] = useState('10.0.0.1');
  const [bootHint, setBootHint] = useState('Start with: scan');
  const { lines: bootLines, done: bootDone } = useBootSequence(
    appPhase === 'booting',
    bootLabel,
    bootIp,
    bootHint,
  );
  const endingName = endingGameState ? getEndingName(endingGameState.flags) : '';
  const endingTrust = endingGameState?.aria.trustScore ?? 0;
  const { lines: endingLines, done: endingDone } = useEndingSequence(
    appPhase === 'ending_sequence',
    endingName,
    endingTrust,
  );
  const [sessionLines, setSessionLines] = useState<TerminalLine[]>(() =>
    disclaimerRequired() ? [] : [makeLine('system', 'nx-field-01 login:')],
  );
  const [username, setUsername] = useState('');
  const [spinnerLine, setSpinnerLine] = useState<TerminalLine | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const terminalRef = useRef<TerminalHandle>(null);
  const bootHandled = useRef(false);
  const spinnerTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinnerFrame = useRef(0);

  // Advance booting → playing (or → ended if restoring a completed run) once MOTD finishes
  useEffect(() => {
    if (!bootDone || appPhase !== 'booting' || bootHandled.current) return;
    bootHandled.current = true;
    if (gameState?.phase === 'ended') {
      const resumeEndingName = getEndingName(gameState.flags);
      setSessionLines(prev => [
        ...prev,
        ...bootLines,
        makeLine('separator', ''),
        makeLine('aria', `// SESSION TERMINATED — ENDING: ${resumeEndingName}`),
        makeLine('separator', ''),
        makeLine('system', '[ENTER] New game'),
        makeLine('separator', ''),
      ]);
      setAppPhase('ended');
    } else {
      setAppPhase('playing');
      setSessionLines(prev => [...prev, ...bootLines]);
    }
  }, [bootDone, appPhase, bootLines, gameState]);

  // When ending animation completes, flush lines + post-game readout and advance to ended.
  // Lines are rebuilt deterministically from endingGameState (same inputs the hook used) rather
  // than reading the hook's animated state — avoids any timing dependency between the last line
  // timer and endingDone, and keeps the dep array complete with no eslint-disable needed.
  // React 18 batches setSessionLines + setAppPhase into one render so the transition from
  // ending_sequence → ended is atomic and the display never shows a duplicate frame.
  useEffect(() => {
    if (!endingDone || appPhase !== 'ending_sequence' || !endingGameState) return;

    const name = getEndingName(endingGameState.flags);
    const trust = endingGameState.aria.trustScore;
    const flushedLines = buildEndingLines(name, trust).map(({ type, content }) =>
      makeLine(type, content),
    );
    const readoutLines = buildPostGameReadout(endingGameState).map(({ type, content }) =>
      makeLine(type, content),
    );

    setSessionLines(prev => [...prev, ...flushedLines, ...readoutLines]);
    setAppPhase('ended');
  }, [endingDone, appPhase, endingGameState]);

  // Auto-save on state changes during play
  useEffect(() => {
    if (
      gameState?.phase === 'playing' ||
      gameState?.phase === 'aria' ||
      gameState?.phase === 'ended'
    )
      saveGame(gameState);
  }, [gameState]);

  // Apply / remove dm-sentinel CSS class when phase changes
  useEffect(() => {
    if (appPhase === 'dm') {
      document.body.classList.add('dm-sentinel');
    } else {
      document.body.classList.remove('dm-sentinel');
    }
  }, [appPhase]);

  // Refocus terminal input whenever all modals close
  useEffect(() => {
    if (!helpOpen && !briefingOpen && !mapOpen && !notesOpen) {
      terminalRef.current?.focus();
    }
  }, [helpOpen, briefingOpen, mapOpen, notesOpen]);

  const push = useCallback((lines: TerminalLine[]) => {
    setSessionLines(prev => [...prev, ...lines]);
  }, []);

  const startSpinner = useCallback(() => {
    spinnerFrame.current = 0;
    setSpinnerLine(makeLine('system', `[ ${SPINNER_FRAMES[0]} ]`));
    spinnerTimer.current = setInterval(() => {
      spinnerFrame.current = (spinnerFrame.current + 1) % SPINNER_FRAMES.length;
      setSpinnerLine(makeLine('system', `[ ${SPINNER_FRAMES[spinnerFrame.current]} ]`));
    }, 120);
  }, []);

  const stopSpinner = useCallback(() => {
    if (spinnerTimer.current) {
      clearInterval(spinnerTimer.current);
      spinnerTimer.current = null;
    }
    setSpinnerLine(null);
  }, []);

  const handleSubmit = useCallback(
    async (raw: string) => {
      // ── Burned: retry ──────────────────────────────────────
      if (appPhase === 'burned') {
        // Non-empty input is silently discarded — the burn screen already shows
        // "Press ENTER to reconnect" and the [RECONNECT] prompt makes the state
        // clear. Re-printing an error on every keystroke adds noise with no value.
        if (raw.trim() !== '') return;
        if (!gameState) return;

        // Compute summary before retry resets state
        const burnedNode = gameState.network.nodes[gameState.network.currentNodeId];
        const burnedLayer = burnedNode?.layer ?? 0;
        const resetNodes = Object.values(gameState.network.nodes).filter(
          n => n && n.layer === burnedLayer && n.compromised,
        );
        const retainedCreds = gameState.player.credentials.filter(
          c => c.obtained && !c.revoked,
        ).length;
        const retainedExfils = gameState.player.exfiltrated.length;

        const retryState = burnRetry(gameState);
        saveGame(retryState);
        setGameState(retryState);
        setSessionLines([]);
        setAiSuggestions([]);

        if (retryState.phase === 'ended') {
          push([
            makeLine('separator', ''),
            makeLine('error', '// NEXUS CORP — OPERATIVE TERMINATED'),
            makeLine('error', '// Anomalous reconnect pattern flagged. Asset decommissioned.'),
            makeLine(
              'error',
              `// ${String(retryState.player.burnCount)} burn events logged. Run closed.`,
            ),
            makeLine('separator', ''),
          ]);
          setAppPhase('ended');
          return;
        }

        const burnWarningLines: ReturnType<typeof makeLine>[] = [];
        if (retryState.player.burnCount >= 3) {
          burnWarningLines.push(
            makeLine('separator', ''),
            makeLine('error', '// NEXUS CORP — ANOMALOUS RECONNECT PATTERN DETECTED'),
            makeLine(
              'error',
              `// ${String(retryState.player.burnCount)} burn events on record. Continued failures will terminate this asset.`,
            ),
          );
        }

        push([
          makeLine('separator', ''),
          makeLine('system', 'Reconnecting...'),
          makeLine(
            'system',
            `// Layer ${String(burnedLayer)} reset — ${String(resetNodes.length)} node(s) de-compromised.`,
          ),
          makeLine(
            'system',
            `// Retained: ${String(retainedCreds)} credential(s), ${String(retainedExfils)} exfil(s).`,
          ),
          ...burnWarningLines,
          makeLine('separator', ''),
        ]);
        setAppPhase(retryState.phase === 'aria' ? 'aria' : 'playing');
        return;
      }

      // ── Ended: new run prompt ─────────────────────────────
      if (appPhase === 'ended') {
        if (raw.trim() !== '') {
          push([makeLine('system', '[ENTER] New game')]);
          return;
        }
        clearSave();
        setGameState(createInitialState());
        setEndingGameState(null);
        setSessionLines([]);
        setAiSuggestions([]);
        bootHandled.current = false;
        setAppPhase('scanning');
        return;
      }

      // ── Login: username ────────────────────────────────────
      if (appPhase === 'login_user') {
        if (!raw.trim()) return;
        const user = raw.trim();
        setUsername(user);
        setAppPhase('login_pass');
        push([makeLine('input', raw), makeLine('system', 'Password:')]);
        return;
      }

      // ── Login: password ────────────────────────────────────
      if (appPhase === 'login_pass') {
        if (!raw) return;
        push([makeLine('input', '********')]);

        if (username === OPERATIVE_USER && raw === OPERATIVE_PASS) {
          push([
            makeLine('system', ''),
            makeLine('output', `Access granted. Welcome, ${username}.`),
            makeLine('separator', ''),
          ]);
          if (hasSave()) {
            setAppPhase('resume_prompt');
            push([
              makeLine('output', 'Previous session detected.'),
              makeLine('system', 'Type  yes  to resume, or  no  to start a new run.'),
            ]);
          } else {
            setGameState(createInitialState());
            setSessionLines([]);
            setAppPhase('scanning');
          }
        } else {
          push([makeLine('error', 'Login incorrect.'), makeLine('system', 'nx-field-01 login:')]);
          setUsername('');
          setAppPhase('login_user');
        }
        return;
      }

      // ── Resume prompt ──────────────────────────────────────
      if (appPhase === 'resume_prompt') {
        const answer = raw.trim().toLowerCase();
        if (!answer) return; // empty Enter is a no-op — don't fall into the else and wipe the save
        push([makeLine('input', raw)]);
        if (answer === 'yes' || answer === 'y') {
          const saved = loadGame();
          if (saved) {
            setGameState(saved);
          } else {
            setGameState(createInitialState());
          }
        } else {
          clearSave();
          setGameState(createInitialState());
        }
        setSessionLines([]);
        setAppPhase('scanning');
        return;
      }

      // ── DM mode (Sentinel channel) ─────────────────────────
      if (appPhase === 'dm') {
        if (!gameState) return;
        const exitCmd = raw.trim().toLowerCase();
        if (exitCmd === 'exit' || exitCmd === 'quit') {
          // Return to main terminal; clear active channel in state
          const cleared = { ...gameState, activeChannel: null } as GameState;
          setGameState(cleared);
          saveGame(cleared);
          setAppPhase(cleared.phase === 'aria' ? 'aria' : 'playing');
          push([
            makeLine('separator', ''),
            makeLine('system', '// SENTINEL: channel closed'),
            makeLine('separator', ''),
          ]);
          return;
        }

        if (!raw.trim()) return;

        push([makeLine('input', raw)]);
        startSpinner();

        let dmReply = '...transmission interrupted.';
        try {
          const res = await fetch('/api/sentinel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: raw,
              sentinelContext: {
                traceLevel: gameState.player.trace,
                currentNodeId: gameState.network.currentNodeId,
                currentLayer: gameState.network.nodes[gameState.network.currentNodeId]?.layer ?? 0,
                recentCommands: gameState.recentCommands,
              },
              messageHistory: gameState.sentinel.messageHistory,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { reply?: string };
            if (typeof data.reply === 'string') dmReply = data.reply;
          }
        } catch {
          // fallback already set
        }

        stopSpinner();

        // Update history in GameState
        const updatedState = {
          ...gameState,
          sentinel: {
            ...gameState.sentinel,
            messageHistory: [
              ...gameState.sentinel.messageHistory,
              { role: 'player' as const, content: raw },
              { role: 'sentinel' as const, content: dmReply },
            ].slice(-40),
          },
        } as GameState;
        setGameState(updatedState);
        saveGame(updatedState);

        push([makeLine('output', `[SENTINEL] ${dmReply}`)]);
        return;
      }

      // ── Playing ────────────────────────────────────────────
      if (!gameState || (appPhase !== 'playing' && appPhase !== 'aria')) return;
      if (!raw.trim()) return;

      if (raw.trim().toLowerCase() === 'clear') {
        setSessionLines([]);
        return;
      }

      if (raw.trim().toLowerCase() === 'help') {
        push([makeLine('input', raw)]);
        setHelpOpen(true);
        return;
      }

      if (raw.trim().toLowerCase() === 'briefing') {
        push([makeLine('input', raw)]);
        setBriefingOpen(true);
        return;
      }

      if (raw.trim().toLowerCase() === 'map') {
        push([makeLine('input', raw)]);
        setMapOpen(true);
        return;
      }

      if (raw.trim().toLowerCase() === 'notes') {
        push([makeLine('input', raw)]);
        setNotesOpen(true);
        return;
      }

      push([makeLine('input', raw)]);
      startSpinner();

      let result;
      try {
        result = await resolveCommand(raw, gameState);
      } catch {
        stopSpinner();
        push([makeLine('error', '// SIGNAL LOST — try again')]);
        return;
      }

      stopSpinner();

      const out = result.lines.map(l => makeLine(l.type, l.content));

      if (result.nextState) {
        const next = result.nextState as GameState;
        setGameState(next);
        if (next.phase === 'burned') {
          out.push(
            makeLine('separator', ''),
            makeLine('error', '// CRITICAL: TRACE LIMIT REACHED — CONNECTION BURNED.'),
            makeLine('system', 'Exfiltrated assets retained. Session credentials preserved.'),
            makeLine('system', 'Press ENTER to reconnect at layer entry point.'),
            makeLine('separator', ''),
          );
          saveGame(next); // persist burned state so a refresh restores the reconnect prompt
          setAppPhase('burned');
          // Do NOT clearSave here — state is needed for burnRetry on Enter.
        } else if (next.phase === 'ended') {
          saveGame(next); // persist so a refresh before Enter restores the ended screen
          setEndingGameState(next);
          // Skip animation entirely if the ending flag is unrecognised (should not happen,
          // but avoids showing "// ENDING: UNKNOWN" to the player on a corrupted save).
          const resolvedName = getEndingName(next.flags);
          setAppPhase(resolvedName !== 'UNKNOWN' ? 'ending_sequence' : 'ended');
        }
      }

      if ('suggestions' in result) {
        setAiSuggestions(result.suggestions ?? []);
      }

      push(out);

      // ── Channel trigger: enter Sentinel DM mode ───────────
      if (result.channelTrigger?.character === 'sentinel') {
        const { triggerType, context } = result.channelTrigger;
        const isManual = triggerType === 'manual_reentry';

        // Mark channel as established in state
        const baseForDm = (result.nextState ?? gameState) as GameState;
        const withChannel = {
          ...baseForDm,
          activeChannel: 'sentinel' as const,
          sentinel: {
            ...baseForDm.sentinel,
            channelEstablished: true,
          },
        } as GameState;
        setGameState(withChannel);
        saveGame(withChannel);

        setAppPhase('dm');

        if (!isManual) {
          // Auto-trigger: call API for opening message
          push([
            makeLine('separator', ''),
            makeLine('dm', '// SENTINEL — INCOMING TRANSMISSION'),
            makeLine('separator', ''),
          ]);
          startSpinner();
          let openingReply = '...I see you.';
          try {
            const res = await fetch('/api/sentinel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: `[SYSTEM: trigger=${triggerType}]`,
                triggerContext: { type: triggerType },
                sentinelContext: context,
                messageHistory: withChannel.sentinel.messageHistory,
              }),
            });
            if (res.ok) {
              const data = (await res.json()) as { reply?: string };
              if (typeof data.reply === 'string') openingReply = data.reply;
            }
          } catch {
            // use fallback
          }
          stopSpinner();

          const withOpening = {
            ...withChannel,
            sentinel: {
              ...withChannel.sentinel,
              messageHistory: [
                ...withChannel.sentinel.messageHistory,
                { role: 'sentinel' as const, content: openingReply },
              ].slice(-40),
            },
          } as GameState;
          setGameState(withOpening);
          saveGame(withOpening);
          push([makeLine('output', `[SENTINEL] ${openingReply}`)]);
        } else {
          push([
            makeLine('separator', ''),
            makeLine('dm', '// SENTINEL — CHANNEL OPEN'),
            makeLine('separator', ''),
          ]);
        }
      }
    },
    [appPhase, gameState, username, push, startSpinner, stopSpinner],
  );

  // ── Prompt and masking per phase ───────────────────────────
  const promptStr =
    appPhase === 'login_user'
      ? ''
      : appPhase === 'login_pass'
        ? ''
        : appPhase === 'burned'
          ? '[RECONNECT]'
          : appPhase === 'ending_sequence'
            ? '[ENDED]'
            : appPhase === 'ended'
              ? '[ENDED]'
              : appPhase === 'dm'
                ? '[SENTINEL] >>'
                : 'nexus $';
  const isMasked = appPhase === 'login_pass';
  const isNoHistory = appPhase === 'login_user' || appPhase === 'login_pass';
  const inputDisabled =
    appPhase === 'scanning' ||
    appPhase === 'booting' ||
    appPhase === 'ending_sequence' ||
    spinnerLine !== null;

  const node = gameState ? currentNode(gameState) : null;
  const nodeIp = node?.ip ?? '---';
  const trace = gameState?.player.trace ?? 0;

  const allLines: TerminalLine[] = [
    ...sessionLines,
    ...(spinnerLine ? [spinnerLine] : []),
    ...(appPhase === 'booting' ? bootLines : []),
    ...(appPhase === 'ending_sequence' ? endingLines : []),
  ];

  if (appPhase === 'welcome') {
    return (
      <WelcomeScreen
        onAgree={() => {
          recordDisclaimerAgreement();
          setAppPhase('prologue');
        }}
      />
    );
  }

  if (appPhase === 'scanning') {
    return (
      <ScanDiskScreen
        onDone={() => {
          const node = gameState?.network.nodes[gameState.network.currentNodeId];
          setBootLabel(node?.label ?? 'CONTRACTOR PORTAL');
          setBootIp(node?.ip ?? '10.0.0.1');
          setBootHint(
            node?.id === 'aria_decision' ? 'Choose your ending: type 1–4.' : 'Start with: scan',
          );
          setSessionLines([]);
          setAppPhase('booting');
        }}
      />
    );
  }

  if (appPhase === 'prologue') {
    return (
      <PrologueScreen
        onContinue={() => {
          setAppPhase('login_user');
          setSessionLines([makeLine('system', 'nx-field-01 login:')]);
        }}
      />
    );
  }

  return (
    <>
      <Terminal
        ref={terminalRef}
        lines={allLines}
        nodeIp={nodeIp}
        trace={trace}
        suggestions={
          appPhase === 'playing' || appPhase === 'aria'
            ? aiSuggestions.length > 0
              ? aiSuggestions
              : gameState
                ? computeContextSuggestions(gameState)
                : []
            : []
        }
        onSubmit={cmd => {
          void handleSubmit(cmd);
        }}
        inputDisabled={inputDisabled}
        inputPrompt={promptStr}
        inputMasked={isMasked}
        inputNoHistory={isNoHistory}
      />
      {helpOpen && (
        <HelpModal
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      )}
      {briefingOpen && (
        <BriefingModal
          onClose={() => {
            setBriefingOpen(false);
          }}
        />
      )}
      {mapOpen && gameState && (
        <MapModal
          gameState={gameState}
          onClose={() => {
            setMapOpen(false);
          }}
        />
      )}
      {notesOpen && gameState && (
        <NotesModal
          gameState={gameState}
          onClose={() => {
            setNotesOpen(false);
          }}
        />
      )}
    </>
  );
};
