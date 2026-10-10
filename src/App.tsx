import { useState, useCallback, useEffect, useRef } from 'react';
import { Terminal } from './components/Terminal';
import type { TerminalHandle } from './components/Terminal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { PrologueScreen } from './components/PrologueScreen';
import { ScanDiskScreen } from './components/ScanDiskScreen';
import { BriefingModal } from './components/BriefingModal';
import { MapModal } from './components/MapModal';
import { HelpModal } from './components/HelpModal';
import { DossierWindow } from './components/DossierWindow';
import { CommsPane } from './components/CommsPane';
import { receivedNexusMessages } from './engine/nexusLine';
import { ariaChannelLines, ariaReplyCount, ariaTabLabel } from './engine/ariaChannel';
import type { CommsHandle } from './components/CommsPane';
import { Workspace } from './components/Workspace';
import type { WorkspaceHandle } from './components/Workspace';
import { useBootSequence } from './hooks/useBootSequence';
import { useEndingSequence, buildEndingLines } from './hooks/useEndingSequence';
import { buildPostGameReadout } from './engine/postGameReadout';
import { buildEpilogue } from './engine/epilogue';
import type { EndingName } from './hooks/useEndingSequence';
import type { TerminalLine } from './types/terminal';
import { makeLine } from './types/terminal';
import type { GameState } from './types/game';
import { hasAccess } from './types/game';
import { createInitialState, currentNode, burnRetry } from './engine/state';
import produce from './engine/produce';
import { resolveCommand } from './engine/commands';
import { LOGIN_FAILED_HINT, OPERATIVE_PASS, OPERATIVE_USER } from './data/operativeLogin';
import { isAriaNameKnown } from './engine/ariaName';
import {
  appendSentinelHistory,
  closeSentinelChannel,
  createRunGuard,
  openSentinelChannel,
  sentinelHistoryLines,
  requestSentinelOpening,
  requestSentinelReply,
} from './engine/sentinelChannel';
import {
  saveGame,
  loadGame,
  hasSave,
  clearSave,
  disclaimerRequired,
  recordDisclaimerAgreement,
  recordUplinkSession,
  uplinkSessionValid,
} from './engine/persistence';
import { loadDossier } from './engine/dossierPersistence';
import { selectContract } from './data/contracts';
import { carryMail, mergeMailResult, unlockedOwners } from './engine/mail';
import { ensureMailbox, markMailRead } from './engine/mailClient';
import { isMailCommand, runMailCommand } from './engine/mailCommand';
import { DIVISION_LAYER } from './data/divisionSeeds';
import type { ContractDefinition } from './types/game';
import { THEMES, THEME_LABELS, applyTheme, saveTheme, loadTheme } from './engine/themes';
import type { Theme } from './engine/themes';

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
    const lockable = node.files.find(
      f => !f.deleted && f.locked && hasAccess(node.accessLevel, f.accessRequired),
    );
    if (lockable) suggestions.push(`unlock ${lockable.name}`);
  }

  if (state.network.previousNodeId) suggestions.push('disconnect');
  if (unlockedOwners(state).length > 0) suggestions.push('mail');

  if (state.player.tools.some(t => t.id === 'log-wiper') && state.player.trace > 20) {
    suggestions.push('wipe-logs');
  }

  return suggestions.slice(0, 6);
};

const VALID_ENDINGS: ReadonlyArray<EndingName> = ['LEAK', 'SELL', 'DESTROY', 'FREE'];

const getEndingName = (flags: Record<string, boolean>): EndingName | 'UNKNOWN' => {
  const key = Object.keys(flags).find(k => k.startsWith('ending_'));
  if (!key) return 'UNKNOWN';
  const name = key.replace('ending_', '').toUpperCase();
  return (VALID_ENDINGS as readonly string[]).includes(name) ? (name as EndingName) : 'UNKNOWN';
};

// Nexus Corp operative credentials

const SPINNER_FRAMES = ['-', '\\', '|', '/'];

const buildContractLines = (contract: ContractDefinition): TerminalLine[] => [
  makeLine('separator', ''),
  makeLine('system', '// NEXUS CORP — INCOMING CONTRACT'),
  makeLine('separator', ''),
  makeLine('output', `CONTRACT : ${contract.title}`),
  makeLine('separator', ''),
  makeLine('system', contract.brief),
  makeLine('separator', ''),
  makeLine('system', `OBJECTIVE: ${contract.objectiveDescription}`),
  makeLine('separator', ''),
  makeLine(
    'system',
    `LOADOUT  : ${String(contract.loadout.exploitCharges)} exploit charge(s)  |  tools: ${contract.loadout.startingTools.join(', ')}`,
  ),
  makeLine('separator', ''),
  makeLine('system', '[A]ccept  /  [R]eroll (once per session)'),
  makeLine('separator', ''),
];

type AppPhase =
  | 'welcome'
  | 'prologue'
  | 'login_user'
  | 'login_pass'
  | 'resume_prompt'
  | 'contract_screen'
  | 'scanning'
  | 'booting'
  | 'playing'
  | 'aria'
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
  const [pendingContract, setPendingContract] = useState<ContractDefinition | null>(null);
  const [contractRerollUsed, setContractRerollUsed] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    const t = loadTheme();
    applyTheme(t);
    return t;
  });

  const terminalRef = useRef<TerminalHandle>(null);
  const workspaceRef = useRef<WorkspaceHandle>(null);
  const openMailRef = useRef<string | null>(null);
  const runId = gameState?.runId ?? null;
  useEffect(() => {
    openMailRef.current = null;
  }, [runId]);
  const bootHandled = useRef(false);
  const spinnerTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinnerFrame = useRef(0);

  // Leaving the uplink initializer: snapshot the boot node, then boot. Shared by the screen's
  // Enter key and by the skip below, so both paths set up the boot sequence identically.
  const finishUplink = useCallback(() => {
    const node = gameState?.network.nodes[gameState.network.currentNodeId];
    setBootLabel(node?.label ?? 'CONTRACTOR PORTAL');
    setBootIp(node?.ip ?? '10.0.0.1');
    setBootHint(
      node?.id === 'aria_decision' ? 'Choose your ending: type 1–4.' : 'Start with: scan',
    );
    setSessionLines([]);
    setAppPhase('booting');
  }, [gameState]);

  // An uplink that completed less than 8 hours ago is still open: skip the initializer screen
  // (the login itself is unchanged).
  useEffect(() => {
    if (appPhase === 'scanning' && uplinkSessionValid()) finishUplink();
  }, [appPhase, finishUplink]);

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
    // The epilogue follows the ending animation and precedes the readout; empty unless the note
    // was revealed.
    const epilogueLines =
      name === 'UNKNOWN'
        ? []
        : buildEpilogue(endingGameState, name).map(({ type, content }) => makeLine(type, content));
    const readoutLines = buildPostGameReadout(endingGameState).map(({ type, content }) =>
      makeLine(type, content),
    );

    setSessionLines(prev => [...prev, ...flushedLines, ...epilogueLines, ...readoutLines]);
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

  const [sentinelLines, setSentinelLines] = useState<TerminalLine[]>([]);
  const [sentinelOpen, setSentinelOpen] = useState(false);
  const [sentinelBusy, setSentinelBusy] = useState(false);
  const [interruptKey, setInterruptKey] = useState(0);
  const commsRef = useRef<CommsHandle>(null);
  const [runGuard] = useState(createRunGuard);

  const push = useCallback((lines: TerminalLine[]) => {
    setSessionLines(prev => [...prev, ...lines]);
  }, []);

  const pushSentinel = useCallback((lines: TerminalLine[]) => {
    setSentinelLines(prev => [...prev, ...lines]);
  }, []);

  // New run / reset: the channel UI starts clean (session-only; a saved activeChannel is
  // never used to reopen it).
  const resetSentinelUi = useCallback(() => {
    // Any Sentinel request still in flight belongs to the run being discarded.
    runGuard.invalidate();
    setSentinelLines([]);
    setSentinelOpen(false);
    setSentinelBusy(false);
  }, [runGuard]);

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
        resetSentinelUi();
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

        const noBurnFailedLines: TerminalLine[] =
          gameState.contract?.objectiveCondition.type === 'no_burn'
            ? [
                makeLine('separator', ''),
                makeLine('error', '// CONTRACT: burn detected — objective failed'),
              ]
            : [];

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
          ...noBurnFailedLines,
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
        setEndingGameState(null);
        setAiSuggestions([]);
        bootHandled.current = false;
        const dossierAfterEnd = loadDossier();
        if (dossierAfterEnd.runsCompleted > 0) {
          const contract = selectContract(undefined, dossierAfterEnd.runsCompleted);
          setPendingContract(contract);
          setContractRerollUsed(false);
          setSessionLines(buildContractLines(contract));
          resetSentinelUi();
          setGameState(null);
          setAppPhase('contract_screen');
        } else {
          setGameState(createInitialState());
          setSessionLines([]);
          resetSentinelUi();
          setAppPhase('scanning');
        }
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
            const dossier = loadDossier();
            if (dossier.runsCompleted > 0) {
              const contract = selectContract(undefined, dossier.runsCompleted);
              setPendingContract(contract);
              setContractRerollUsed(false);
              setSessionLines(buildContractLines(contract));
              setAppPhase('contract_screen');
            } else {
              setGameState(createInitialState());
              setSessionLines([]);
              resetSentinelUi();
              setAppPhase('scanning');
            }
          }
        } else {
          push([
            makeLine('error', 'Login incorrect.'),
            makeLine('system', LOGIN_FAILED_HINT),
            makeLine('system', 'nx-field-01 login:'),
          ]);
          setUsername('');
          setAppPhase('login_user');
        }
        return;
      }

      // ── Contract screen ────────────────────────────────────
      if (appPhase === 'contract_screen') {
        const input = raw.trim().toLowerCase();
        if (!input) return;
        push([makeLine('input', raw)]);
        if (input === 'a') {
          if (!pendingContract) return;
          const accepted = pendingContract;
          setGameState(createInitialState(undefined, accepted.id));
          setPendingContract(null);
          setContractRerollUsed(false);
          setSessionLines([]);
          resetSentinelUi();
          bootHandled.current = false;
          setAppPhase('scanning');
        } else if (input === 'r') {
          if (contractRerollUsed) {
            push([makeLine('system', '// REROLL: already used — one reroll per session')]);
          } else {
            const rerolled = selectContract(pendingContract?.id, loadDossier().runsCompleted);
            setPendingContract(rerolled);
            setContractRerollUsed(true);
            push(buildContractLines(rerolled));
          }
        } else {
          push([makeLine('system', '[A]ccept  /  [R]eroll')]);
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
            // Start the channel UI clean, but show the saved conversation (if any).
            resetSentinelUi();
            setSentinelLines(sentinelHistoryLines(saved.sentinel.messageHistory, username));
          } else {
            setGameState(createInitialState());
            resetSentinelUi();
          }
          setSessionLines([]);
          setAppPhase('scanning');
        } else {
          clearSave();
          const dossier = loadDossier();
          if (dossier.runsCompleted > 0) {
            const contract = selectContract(undefined, dossier.runsCompleted);
            setPendingContract(contract);
            setContractRerollUsed(false);
            setSessionLines(buildContractLines(contract));
            resetSentinelUi();
            setAppPhase('contract_screen');
          } else {
            setGameState(createInitialState());
            resetSentinelUi();
            setSessionLines([]);
            setAppPhase('scanning');
          }
        }
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
        workspaceRef.current?.showOverlay('help');
        return;
      }

      if (raw.trim().toLowerCase() === 'briefing') {
        push([makeLine('input', raw)]);
        workspaceRef.current?.showOverlay('briefing');
        return;
      }

      if (raw.trim().toLowerCase() === 'map') {
        push([makeLine('input', raw)]);
        workspaceRef.current?.showAux('map');
        return;
      }

      if (raw.trim().toLowerCase() === 'notes' || raw.trim().toLowerCase() === 'case') {
        push([makeLine('input', raw)]);
        workspaceRef.current?.showAux('case');
        return;
      }

      if (isMailCommand(raw)) {
        push([makeLine('input', raw)]);
        const mailToken = runGuard.token();
        void runMailCommand(raw, gameState, openMailRef.current).then(result => {
          if (!runGuard.isCurrent(mailToken)) return; // the run was reset while waiting
          if (result.ownerId) openMailRef.current = result.ownerId;
          push(result.lines.map(l => makeLine(l.type, l.content)));
          const incoming = result.nextState;
          if (incoming) {
            setGameState(prev => {
              if (!prev) return prev;
              const merged = mergeMailResult(prev, incoming, result.ownerId);
              if (merged !== prev) saveGame(merged);
              return merged;
            });
          }
          if (result.ownerId) workspaceRef.current?.showMail(result.ownerId, result.messageId);
          else if (result.showTab) workspaceRef.current?.showAux('mail');
        });
        return;
      }

      if (raw.trim().toLowerCase() === 'dossier') {
        push([makeLine('input', raw)]);
        workspaceRef.current?.showOverlay('dossier');
        return;
      }

      const verb = raw.trim().toLowerCase();
      if (verb === 'explorer' || verb === 'files') {
        push([makeLine('input', raw)]);
        workspaceRef.current?.focusPane('files');
        return;
      }

      if (raw.trim().toLowerCase().startsWith('theme')) {
        const arg = raw.trim().slice(5).trim().toLowerCase();
        push([makeLine('input', raw)]);
        if (!arg) {
          push([
            makeLine('system', 'Available themes:'),
            ...THEMES.map(t =>
              makeLine('system', `  ${t === currentTheme ? '>' : ' '} ${THEME_LABELS[t]}`),
            ),
            makeLine('system', 'Usage: theme <name>'),
          ]);
        } else if ((THEMES as readonly string[]).includes(arg)) {
          const next = arg as Theme;
          applyTheme(next);
          saveTheme(next);
          setCurrentTheme(next);
          push([makeLine('system', `// Terminal theme set to: ${next}`)]);
        } else {
          push([
            makeLine('error', `// Unknown theme: ${arg}`),
            makeLine('system', `Available: ${THEMES.join(', ')}`),
          ]);
        }
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
      // Her replies live in the COMMS tab. The first one gets a pointer here, so a reply that
      // arrives while the terminal is focused is not silently missed.
      if (result.ariaReply !== undefined && gameState.aria.messageHistory.length === 0) {
        out.push(makeLine('aria', `// reply received on COMMS (${ariaTabLabel(gameState)})`));
      }

      if (result.nextState) {
        const next = result.nextState as GameState;
        // Mail that landed while this turn was pending must survive it.
        setGameState(prev => (prev ? carryMail(prev, next) : next));
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
          // Finalise objective for condition types evaluated at run-end rather than mid-run.
          const activeContract = next.contract;
          const finalNext =
            activeContract && !activeContract.objectiveComplete
              ? produce(next, s => {
                  if (!s.contract) return;
                  const condition = s.contract.objectiveCondition;
                  if (condition.type === 'trace_cap' && !s.flags['contract_cap_exceeded']) {
                    s.contract.objectiveComplete = true;
                  } else if (condition.type === 'no_burn' && s.player.burnCount === 0) {
                    s.contract.objectiveComplete = true;
                  } else if (condition.type === 'avoid_division') {
                    const targetLayer = DIVISION_LAYER[condition.divisionId];
                    const anyCompromised = Object.values(s.network.nodes).some(
                      n => n?.layer === targetLayer && n.compromised,
                    );
                    if (!anyCompromised) s.contract.objectiveComplete = true;
                  }
                })
              : next;
          if (finalNext !== next) setGameState(finalNext);
          saveGame(finalNext); // persist so a refresh before Enter restores the ended screen
          setEndingGameState(finalNext);
          // Skip animation entirely if the ending flag is unrecognised (should not happen,
          // but avoids showing "// ENDING: UNKNOWN" to the player on a corrupted save).
          const resolvedName = getEndingName(finalNext.flags);
          setAppPhase(resolvedName !== 'UNKNOWN' ? 'ending_sequence' : 'ended');
        }
      }

      if ('suggestions' in result) {
        setAiSuggestions(result.suggestions ?? []);
      }

      push(out);

      // ── Channel trigger: open the Sentinel channel in the COMMS pane ──
      if (result.channelTrigger?.character === 'sentinel') {
        const trigger = result.channelTrigger;
        const base = (result.nextState ?? gameState) as GameState;
        const firstContact = !base.sentinel.channelEstablished;
        const withChannel = openSentinelChannel(base);
        setGameState(withChannel);
        saveGame(withChannel);
        setSentinelOpen(true);
        if (firstContact) setInterruptKey(k => k + 1);
        workspaceRef.current?.focusPane('comms');

        if (trigger.triggerType === 'manual_reentry') {
          pushSentinel([
            makeLine('separator', ''),
            makeLine('dm', '// SENTINEL — CHANNEL OPEN'),
            makeLine('separator', ''),
          ]);
        } else {
          pushSentinel([
            makeLine('separator', ''),
            makeLine('dm', '// SENTINEL — INCOMING TRANSMISSION'),
            makeLine('separator', ''),
          ]);
          setSentinelBusy(true);
          const token = runGuard.token();
          const opening = await requestSentinelOpening(trigger, withChannel);
          // The run was reset while waiting: drop the stale opening line.
          if (!runGuard.isCurrent(token)) return;
          setSentinelBusy(false);
          setGameState(prev => {
            if (!prev) return prev;
            const updated = appendSentinelHistory(prev, [{ role: 'sentinel', content: opening }]);
            saveGame(updated);
            return updated;
          });
          pushSentinel([makeLine('output', `sentinel >> ${opening}`)]);
        }
      }
    },
    [
      appPhase,
      contractRerollUsed,
      currentTheme,
      gameState,
      pendingContract,
      push,
      pushSentinel,
      resetSentinelUi,
      runGuard,
      startSpinner,
      stopSpinner,
      username,
    ],
  );

  const handleSentinelSubmit = useCallback(
    async (raw: string) => {
      // Ignore sends while closed, while a reply is pending, or when empty.
      if (!gameState || !sentinelOpen || sentinelBusy) return;
      const text = raw.trim();
      if (!text) return;
      const lower = text.toLowerCase();

      if (lower === 'exit' || lower === 'quit') {
        const cleared = closeSentinelChannel(gameState);
        setGameState(cleared);
        saveGame(cleared);
        setSentinelOpen(false);
        pushSentinel([
          makeLine('separator', ''),
          makeLine('system', '// SENTINEL: channel closed'),
          makeLine('separator', ''),
        ]);
        workspaceRef.current?.focusPane('term');
        return;
      }

      pushSentinel([makeLine('output', `${username} >> ${text}`)]);
      setSentinelBusy(true);
      const token = runGuard.token();
      const reply = await requestSentinelReply(gameState, text);
      // The run was reset while waiting: drop the stale reply (the reset already cleared busy).
      if (!runGuard.isCurrent(token)) return;
      setSentinelBusy(false);

      // Functional updater avoids a stale-closure race with commands typed meanwhile.
      setGameState(prev => {
        if (!prev) return prev;
        const updated = appendSentinelHistory(prev, [
          { role: 'player', content: text },
          { role: 'sentinel', content: reply },
        ]);
        saveGame(updated);
        return updated;
      });
      pushSentinel([makeLine('output', `sentinel >> ${reply}`)]);
    },
    [gameState, sentinelOpen, sentinelBusy, username, pushSentinel, runGuard],
  );

  // ── Prompt and masking per phase ───────────────────────────
  const promptStr =
    appPhase === 'login_user'
      ? ''
      : appPhase === 'login_pass'
        ? ''
        : appPhase === 'contract_screen'
          ? '[CONTRACT]'
          : appPhase === 'burned'
            ? '[RECONNECT]'
            : appPhase === 'ending_sequence'
              ? '[ENDED]'
              : appPhase === 'ended'
                ? '[ENDED]'
                : 'nexus $';
  const isMasked = appPhase === 'login_pass';
  const isNoHistory = appPhase === 'login_user' || appPhase === 'login_pass';
  const inputDisabled =
    appPhase === 'scanning' ||
    appPhase === 'booting' ||
    appPhase === 'ending_sequence' ||
    spinnerLine !== null;
  // The name "Aria" stays hidden until the player learns it through Sentinel's lore.
  const ariaNameKnown = gameState ? isAriaNameKnown(gameState) : false;
  // Read once per render (it parses localStorage).
  const dossierData = loadDossier();
  const explorerDisabled = inputDisabled || (appPhase !== 'playing' && appPhase !== 'aria');

  const node = gameState ? currentNode(gameState) : null;
  const nodeIp = node?.ip ?? '---';
  const trace = gameState?.player.trace ?? 0;
  const nexusMessages = gameState ? receivedNexusMessages(gameState) : [];
  const ariaLines = gameState ? ariaChannelLines(gameState) : [];

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
    // The skip effect above moves on within the same tick; show nothing meanwhile.
    if (uplinkSessionValid()) return null;
    return (
      <ScanDiskScreen
        onDone={() => {
          recordUplinkSession();
          finishUplink();
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
    <Workspace
      ref={workspaceRef}
      gameState={gameState}
      nodeIp={nodeIp}
      trace={trace}
      explorerDisabled={explorerDisabled}
      onRunCommand={cmd => {
        void handleSubmit(cmd);
      }}
      onTerminalFocused={() => {
        terminalRef.current?.focus();
      }}
      comms={
        <CommsPane
          ref={commsRef}
          sentinelEstablished={gameState?.sentinel.channelEstablished ?? false}
          sentinelOpen={sentinelOpen}
          sentinelLines={sentinelLines}
          sentinelBusy={sentinelBusy}
          interruptKey={interruptKey}
          nexusMessages={nexusMessages}
          trace={trace}
          ariaLines={ariaLines}
          ariaLabel={gameState ? ariaTabLabel(gameState) : 'CASSANDRA'}
          onSend={text => {
            void handleSentinelSubmit(text);
          }}
        />
      }
      commsAlert={sentinelOpen}
      commsActivity={nexusMessages.length + (gameState ? ariaReplyCount(gameState) : 0)}
      onCommsFocused={() => {
        commsRef.current?.focus();
      }}
      onOpenMailbox={ownerId => {
        if (!gameState) return;
        const owner = unlockedOwners(gameState).find(o => o.id === ownerId);
        if (!owner) return;
        openMailRef.current = ownerId;
        const token = runGuard.token();
        void ensureMailbox(gameState, owner).then(incoming => {
          if (!runGuard.isCurrent(token)) return; // the run was reset while waiting
          setGameState(prev => {
            if (!prev) return prev;
            const merged = mergeMailResult(prev, incoming, ownerId);
            if (merged !== prev) saveGame(merged);
            return merged;
          });
        });
      }}
      onReadMail={messageId => {
        setGameState(prev => {
          if (!prev) return prev;
          const next = markMailRead(prev, [messageId]);
          if (next !== prev) saveGame(next);
          return next;
        });
      }}
      terminal={
        <Terminal
          ref={terminalRef}
          lines={allLines}
          nodeIp={nodeIp}
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
      }
      map={gameState ? <MapModal gameState={gameState} /> : null}
      help={<HelpModal ariaNameKnown={ariaNameKnown} />}
      briefing={<BriefingModal />}
      dossier={
        <DossierWindow
          dossier={dossierData}
          nameKnown={ariaNameKnown || dossierData.runsCompleted > 0}
        />
      }
    />
  );
};
