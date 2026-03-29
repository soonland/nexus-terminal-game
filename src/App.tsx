import { useState, useCallback, useEffect, useRef } from 'react';
import { Terminal } from './components/Terminal';
import { useSplash } from './hooks/useSplash';
import { useBootSequence } from './hooks/useBootSequence';
import type { TerminalLine } from './types/terminal';
import { makeLine } from './types/terminal';
import type { GameState } from './types/game';
import { createInitialState, currentNode } from './engine/state';
import { resolveCommand } from './engine/commands';
import { saveGame, loadGame, hasSave, clearSave } from './engine/persistence';

// Nexus Corp operative credentials
const OPERATIVE_USER = 'ghost';
const OPERATIVE_PASS = 'nX-2847';

const SPINNER_FRAMES = ['-', '\\', '|', '/'];

type AppPhase =
  | 'splash'
  | 'login_user'
  | 'login_pass'
  | 'booting'
  | 'resume_prompt'
  | 'playing'
  | 'burned';

const SUGGESTIONS = ['help', 'status', 'scan', 'map', 'inventory'];

export const App = () => {
  const { lines: splashLines, done: splashDone } = useSplash();
  const { lines: bootLines, done: bootDone } = useBootSequence();

  const [appPhase, setAppPhase] = useState<AppPhase>('splash');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [sessionLines, setSessionLines] = useState<TerminalLine[]>([]);
  const [username, setUsername] = useState('');
  const [spinnerLine, setSpinnerLine] = useState<TerminalLine | null>(null);

  const bootStarted = useRef(false);
  const resumeHandled = useRef(false);
  const spinnerTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinnerFrame = useRef(0);

  // Advance splash → login_user once banner finishes
  useEffect(() => {
    if (splashDone && appPhase === 'splash') {
      setAppPhase('login_user');
      setSessionLines([makeLine('system', 'nx-field-01 login:')]);
    }
  }, [splashDone, appPhase]);

  // Advance booting → resume_prompt or playing once MOTD finishes
  useEffect(() => {
    if (!bootDone || appPhase !== 'booting' || resumeHandled.current) return;
    resumeHandled.current = true;

    if (hasSave()) {
      setAppPhase('resume_prompt');
      setSessionLines(prev => [
        ...prev,
        ...bootLines,
        makeLine('separator', ''),
        makeLine('output', 'Previous session detected.'),
        makeLine('system', 'Type  yes  to resume, or  no  to start a new run.'),
      ]);
    } else {
      setGameState(createInitialState());
      setAppPhase('playing');
      setSessionLines(prev => [...prev, ...bootLines]);
    }
  }, [bootDone, appPhase, bootLines]);

  // Auto-save on state changes during play
  useEffect(() => {
    if (gameState?.phase === 'playing') saveGame(gameState);
  }, [gameState]);

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
      // ── Splash (shouldn't happen, input disabled) ──────────
      if (appPhase === 'splash') return;

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
        // Echo masked — never show the actual password
        push([makeLine('input', '********')]);

        if (username === OPERATIVE_USER && raw === OPERATIVE_PASS) {
          push([
            makeLine('system', ''),
            makeLine('output', `Access granted. Welcome, ${username}.`),
            makeLine('separator', ''),
          ]);
          setAppPhase('booting');
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
            setAppPhase('playing');
            push([makeLine('system', 'Session restored.'), makeLine('separator', '')]);
          }
        } else {
          clearSave();
          setGameState(createInitialState());
          setAppPhase('playing');
          push([makeLine('system', 'Starting new run.'), makeLine('separator', '')]);
        }
        return;
      }

      // ── Playing ────────────────────────────────────────────
      if (!gameState || appPhase !== 'playing') return;

      if (raw.trim().toLowerCase() === 'clear') {
        setSessionLines([]);
        return;
      }

      push([makeLine('input', raw)]);
      startSpinner();

      const result = await resolveCommand(raw, gameState);

      stopSpinner();

      const out = result.lines.map(l => makeLine(l.type, l.content));

      if (result.nextState) {
        const next = result.nextState as GameState;
        setGameState(next);
        if (next.phase === 'burned') {
          out.push(
            makeLine('separator', ''),
            makeLine('error', 'TRACE LIMIT REACHED — CONNECTION BURNED.'),
            makeLine('system', 'Exfiltrated assets retained. Restarting session...'),
            makeLine('separator', ''),
          );
          setAppPhase('burned');
          clearSave();
        }
      }

      push(out);
    },
    [appPhase, gameState, username, push, startSpinner, stopSpinner],
  );

  // ── Prompt and masking per phase ───────────────────────────
  const promptStr = appPhase === 'login_user' ? '' : appPhase === 'login_pass' ? '' : 'nexus $';
  const isMasked = appPhase === 'login_pass';
  const isNoHistory = appPhase === 'login_user' || appPhase === 'login_pass';
  const inputDisabled =
    appPhase === 'splash' ||
    appPhase === 'booting' ||
    appPhase === 'burned' ||
    spinnerLine !== null;

  const node = gameState ? currentNode(gameState) : null;
  const nodeIp = node?.ip ?? '---';
  const trace = gameState?.player.trace ?? 0;

  // Combine all line sources
  // bootLines are only streamed dynamically during 'booting'; once done they are
  // snapshotted into sessionLines so they stay in place as commands are typed.
  const allLines: TerminalLine[] = [
    ...splashLines,
    ...sessionLines,
    ...(spinnerLine ? [spinnerLine] : []),
    ...(appPhase === 'booting' ? bootLines : []),
  ];

  // Kick off boot rendering only once
  useEffect(() => {
    if (appPhase === 'booting' && !bootStarted.current) {
      bootStarted.current = true;
    }
  }, [appPhase]);

  return (
    <Terminal
      lines={allLines}
      nodeIp={nodeIp}
      trace={trace}
      suggestions={appPhase === 'playing' ? SUGGESTIONS : []}
      onSubmit={cmd => {
        void handleSubmit(cmd);
      }}
      inputDisabled={inputDisabled}
      inputPrompt={promptStr}
      inputMasked={isMasked}
      inputNoHistory={isNoHistory}
    />
  );
};
