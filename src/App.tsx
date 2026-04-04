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
      suggestions.push(`login ${obtained.username} ${obtained.password}`);
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
  | 'burned';

export const App = () => {
  const [appPhase, setAppPhase] = useState<AppPhase>(() =>
    disclaimerRequired() ? 'welcome' : 'login_user',
  );

  const { lines: bootLines, done: bootDone } = useBootSequence(appPhase === 'booting');
  const [gameState, setGameState] = useState<GameState | null>(null);
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

  // Advance booting → playing once MOTD finishes
  useEffect(() => {
    if (!bootDone || appPhase !== 'booting' || bootHandled.current) return;
    bootHandled.current = true;
    setAppPhase('playing');
    setSessionLines(prev => [...prev, ...bootLines]);
  }, [bootDone, appPhase, bootLines]);

  // Auto-save on state changes during play
  useEffect(() => {
    if (gameState?.phase === 'playing' || gameState?.phase === 'aria') saveGame(gameState);
  }, [gameState]);

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
        if (raw.trim() !== '') {
          push([makeLine('error', '// No commands accepted — press ENTER to reconnect.')]);
          return;
        }
        if (!gameState) return;

        // Compute summary before retry resets state
        const burnedNode = gameState.network.nodes[gameState.network.currentNodeId];
        const burnedLayer = burnedNode?.layer ?? 0;
        const resetNodes = Object.values(gameState.network.nodes).filter(
          n => n && n.layer === burnedLayer && n.compromised,
        );
        const retainedCreds = gameState.player.credentials.filter(c => c.obtained).length;
        const retainedExfils = gameState.player.exfiltrated.length;

        const retryState = burnRetry(gameState);
        saveGame(retryState);
        setGameState(retryState);
        setSessionLines([]);
        setAiSuggestions([]);
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
          makeLine('separator', ''),
        ]);
        setAppPhase('playing');
        return;
      }

      // ── Login: username ────────────────────────────────────
      if (appPhase === 'login_user') {
        const user = raw.trim();
        setUsername(user);
        setAppPhase('login_pass');
        push([makeLine('input', raw), makeLine('system', 'Password:')]);
        return;
      }

      // ── Login: password ────────────────────────────────────
      if (appPhase === 'login_pass') {
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

      // ── Playing ────────────────────────────────────────────
      if (!gameState || (appPhase !== 'playing' && appPhase !== 'aria')) return;

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
        }
      }

      if ('suggestions' in result) {
        setAiSuggestions(result.suggestions ?? []);
      }

      push(out);
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
          : 'nexus $';
  const isMasked = appPhase === 'login_pass';
  const isNoHistory = appPhase === 'login_user' || appPhase === 'login_pass';
  const inputDisabled = appPhase === 'scanning' || appPhase === 'booting' || spinnerLine !== null;

  const node = gameState ? currentNode(gameState) : null;
  const nodeIp = node?.ip ?? '---';
  const trace = gameState?.player.trace ?? 0;

  const allLines: TerminalLine[] = [
    ...sessionLines,
    ...(spinnerLine ? [spinnerLine] : []),
    ...(appPhase === 'booting' ? bootLines : []),
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
