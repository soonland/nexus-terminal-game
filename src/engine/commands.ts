import type { GameState, CommandOutput, AccessLevel, FavorOffer, ToolId } from '../types/game';
import { hasAccess } from '../types/game';
import { currentNode, addTrace, thresholdFlag, TRACE_THRESHOLDS } from './state';
import produce from './produce';
import { LAYER_KEY_ANCHOR } from './buildConnectivity';
import { runSentinelTurn } from './sentinel';
import { loadDossier, recordEnding } from './dossierPersistence';
import type { EndingName } from '../types/dossier';
import { shouldSuppressMutation, injectConstraintFragment } from './faradayCage';
import { detectChannelTrigger, isChannelBlocked, layerReachedFlag } from './channel';

interface WorldAIResponse {
  narrative: string;
  traceChange: number;
  accessGranted: boolean;
  newAccessLevel: 'none' | 'user' | 'admin' | 'root' | null;
  flagsSet: Record<string, boolean>;
  nodesUnlocked: string[];
  isUnknown: boolean;
  suggestions?: unknown;
}

// Mirrors api/aria.ts#AriaAIResponse — kept in sync manually (src/ cannot import from api/)
interface AriaAIResponse {
  reply: string;
  trustDelta: number;
  offersFavor?: FavorOffer; // FavorOffer = { description: string; cost: number }
}

const GENERIC_TOOL_DATA: Partial<Record<ToolId, { name: string; description: string }>> = {
  'log-wiper': {
    name: 'Log Wiper',
    description: 'Single-use log sanitisation tool. Reduces trace by 15%. Destroyed after use.',
  },
};

const ARIA_AI_FALLBACK: AriaAIResponse = {
  reply: '...signal lost. try again.',
  trustDelta: 0,
};

const WORLD_AI_FALLBACK: WorldAIResponse = {
  narrative: '[World AI unavailable — operating in offline mode. Try basic commands.]',
  traceChange: 0,
  accessGranted: false,
  newAccessLevel: null,
  flagsSet: {},
  nodesUnlocked: [],
  isUnknown: true,
  suggestions: [],
};

type Out = CommandOutput['lines'];
const line = (content: string, type: CommandOutput['lines'][0]['type'] = 'system') => ({
  type,
  content,
});
const out = (content: string) => line(content, 'output');
const sys = (content: string) => line(content, 'system');
const err = (content: string) => line(content, 'error');
const sep = () => line('', 'separator');

// ── Command resolution ─────────────────────────────────────
/**
 * Resolve a raw command string against the current game state.
 *
 * Callers are responsible for gating on `state.phase` before invoking this
 * function. In particular, commands should not be dispatched when
 * `state.phase === 'burned'` — `App.tsx` handles that guard at the UI layer.
 */
export const resolveCommand = async (raw: string, state: GameState): Promise<CommandOutput> => {
  if (state.phase === 'burned') {
    // Callers should gate on state.phase before invoking (see JSDoc above).
    // Return an empty result rather than executing commands on a burned session.
    console.warn('resolveCommand called with burned state — returning empty result');
    return { lines: [] };
  }

  if (state.phase === 'ended') {
    return { lines: [] };
  }

  // ── aria_decision gate — only 1–4 accepted ────────────────
  // While connected to aria_decision the player must choose an ending.
  // All other input — including engine commands and the aria: prefix — is
  // blocked until a valid choice is made. disconnect is intentionally blocked:
  // arriving at the decision terminal is a point of no return.
  if (currentNode(state).id === 'aria_decision') {
    const choice = raw.trim();
    if (choice === '1' || choice === '2' || choice === '3' || choice === '4') {
      return cmdDecisionTerminal(choice, state);
    }
    return {
      lines: [
        err('// INPUT REJECTED — the terminal awaits your decision.'),
        sys('  [1] LEAK   [2] SELL   [3] DESTROY   [4] FREE'),
      ],
    };
  }

  // ── Pending favor confirmation ────────────────────────────
  // This block runs before the aria: prefix check intentionally.
  // While a favor is pending the player must respond (yes/no) before
  // any other command — including "aria: …" — is processed. Typing
  // "aria: hello" here declines the offer, not sends a new message.
  // This forces a clear acknowledgement and prevents offer-stacking.
  if (state.aria.pendingFavor) {
    const answer = raw.trim().toLowerCase();
    if (answer === 'yes' || answer === 'y') {
      return withTurn(cmdAcceptFavor(state), raw, state);
    }
    return withTurn(cmdDeclineFavor(state), raw, state);
  }

  // ── aria: prefix → route to Aria AI on any node ──────────
  // Note: intentionally not gated on aria.discovered — spec §7.5 explicitly allows
  // the aria: prefix to reach Aria from any node at any time.
  if (raw.trim().toLowerCase().startsWith('aria:')) {
    const message = raw.trim().slice('aria:'.length).trim();
    if (!message) {
      return withTurn({ lines: [line('// ARIA: [no message received]', 'aria')] }, raw, state);
    }
    return cmdAriaAI(message, raw, state);
  }

  const [cmd, ...args] = raw.trim().split(/\s+/);
  const verb = cmd.toLowerCase();

  // ── Local commands (no trace, no state change) ───────────
  let result: CommandOutput | null = null;
  switch (verb) {
    case 'help':
      result = { lines: [] }; // handled as modal in App
      break;
    case 'status':
      result = cmdStatus(state);
      break;
    case 'whoami':
      result = cmdWhoami(state);
      break;
    case 'map':
      result = { lines: [] }; // handled as modal in App
      break;
    case 'clear':
      result = { lines: [] };
      break;
    case 'briefing':
      result = { lines: [] }; // handled as modal in App
      break;
    case 'notes':
      result = { lines: [] }; // handled as modal in App
      break;
    case 'inventory':
    case 'inv':
      result = cmdInventory(state);
      break;
    case 'msg':
      result = cmdMsg(args, state);
      break;
  }
  if (result) return result;

  // ── Engine commands ──────────────────────────────────────
  switch (verb) {
    case 'scan':
      result = cmdScan(args, state);
      break;
    case 'connect':
      return withTurn(await cmdConnect(args, state), raw, state);
    case 'login':
      result = cmdLogin(args, state);
      break;
    case 'ls':
      result = cmdLs(args, state);
      break;
    case 'cat':
      return withTurn(await cmdCat(args, state), raw, state);
    case 'disconnect':
    case 'exit':
    case 'logoff':
    case 'logout':
      result = cmdDisconnect(state);
      break;
    case 'exploit':
      return withTurn(await cmdExploit(args, state), raw, state);
    case 'exfil':
      result = cmdExfil(args, state);
      break;
    case 'decrypt':
      result = cmdDecrypt(args, state);
      break;
    case 'wipe-logs':
      result = cmdWipeLogs(state);
      break;
    case 'spoof':
      result = cmdSpoof(state);
      break;
  }
  if (result) return withTurn(result, raw, state);

  // ── Layer-5 nodes → route to Aria AI ────────────────────
  if (currentNode(state).layer === 5) {
    return cmdAriaAI(raw, raw, state);
  }

  // ── Unknown → route to World AI ─────────────────────────
  return cmdWorldAI(raw, state);
};

// ── Threshold alert messages ──────────────────────────────
// Derived from the canonical TRACE_THRESHOLDS in state.ts — do not add raw numbers here.
// onCross: optional state mutation to apply when this threshold is first crossed.
const THRESHOLD_ALERT_META: Record<
  (typeof TRACE_THRESHOLDS)[number],
  { msg: string; type: 'system' | 'error'; onCross?: (s: GameState) => GameState }
> = {
  31: {
    msg: '// ALERT: Anomalous activity flagged. Watchlist active.',
    type: 'system',
    onCross: s =>
      produce(s, draft => {
        for (const node of Object.values(draft.network.nodes)) {
          if (!node?.compromised) continue;
          let locked = 0;
          for (const f of node.files) {
            if (locked >= 2) break;
            if (!f.tripwire && !f.locked) {
              f.locked = true;
              locked++;
            }
          }
        }
      }),
  },
  61: { msg: '// ALERT: Active intrusion response initiated.', type: 'system' },
  86: { msg: '// CRITICAL: One more detection event triggers full lockout.', type: 'error' },
};

/**
 * Detect newly crossed thresholds and:
 *   - Append the corresponding alert line to the output.
 *   - Run any onCross side-effect defined in THRESHOLD_ALERT_META.
 */
const applyThresholdEffects = (prevState: GameState, result: CommandOutput): CommandOutput => {
  const nextState = result.nextState as GameState | undefined;
  if (!nextState) return result;

  const alertLines: Out = [];
  let mutated = nextState;

  for (const pct of TRACE_THRESHOLDS) {
    const flag = thresholdFlag(pct);
    if (!prevState.flags[flag] && nextState.flags[flag]) {
      const { msg, type, onCross } = THRESHOLD_ALERT_META[pct];
      alertLines.push(sep(), line(msg, type), sep());
      if (onCross) mutated = onCross(mutated);
    }
  }

  if (alertLines.length === 0) return result;
  return { ...result, lines: [...result.lines, ...alertLines], nextState: mutated };
};

// ── Merge turn tracking into any CommandOutput ────────────
const withTurn = (result: CommandOutput, raw: string, baseState: GameState): CommandOutput => {
  const base = (result.nextState ?? baseState) as GameState;
  const withAlerts = applyThresholdEffects(baseState, { ...result, nextState: base });
  const advanced = advanceTurn(withAlerts.nextState as GameState, raw);
  const sentinel = runSentinelTurn(advanced);
  const finalState = sentinel.state;

  // Detect whether this turn fires a Sentinel channel trigger
  const trigger = detectChannelTrigger(baseState, finalState, raw);

  // Stamp the layer-reached flag when a layer breach is detected, so the
  // same layer does not fire again on the next connect to that layer.
  let postTriggerState = finalState;
  if (trigger?.triggerType === 'layer_breach') {
    const nextNode = finalState.network.nodes[finalState.network.currentNodeId];
    if (nextNode) {
      const layerFlag = layerReachedFlag(nextNode.layer);
      postTriggerState = produce(finalState, s => {
        s.flags[layerFlag] = true;
      });
    }
  }

  return {
    ...withAlerts,
    lines: [...withAlerts.lines, ...sentinel.lines],
    nextState: postTriggerState,
    ...(trigger ? { channelTrigger: trigger } : {}),
  };
};

// ── Track command in recentCommands / turnCount ───────────
const DECISION_COMMANDS = new Set(['connect', 'exploit', 'exfil', 'wipe-logs', 'login']);

const advanceTurn = (state: GameState, raw: string): GameState => {
  const recentCommands = [...state.recentCommands, raw].slice(-8);
  const verb = raw.trim().split(/\s+/)[0].toLowerCase();
  const isDecision = DECISION_COMMANDS.has(verb);
  return produce(state, s => {
    s.turnCount = s.turnCount + 1;
    s.recentCommands = recentCommands;
    if (isDecision) {
      s.decisionLog.push({ turn: s.turnCount, command: raw.trim() });
    }
  });
};

// ── World AI ──────────────────────────────────────────────
const cmdWorldAI = async (raw: string, state: GameState): Promise<CommandOutput> => {
  const node = currentNode(state);
  const player = state.player;

  const payload = {
    command: raw,
    currentNode: {
      id: node.id,
      ip: node.ip,
      label: node.label,
      layer: node.layer,
      accessLevel: node.accessLevel,
      services: node.services.map(s => ({
        name: s.name,
        port: s.port,
        vulnerable: s.vulnerable,
      })),
      files: node.files
        .filter(f => hasAccess(node.accessLevel, f.accessRequired))
        .map(f => ({ name: f.name, type: f.type })),
    },
    playerState: {
      handle: player.handle,
      trace: player.trace,
      charges: player.charges,
      tools: player.tools.map(t => ({ id: t.id })),
    },
    recentCommands: state.recentCommands,
    turnCount: state.turnCount,
  };

  let aiResponse: WorldAIResponse;
  try {
    const res = await fetch('/api/world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`World AI returned ${String(res.status)}`);
    aiResponse = (await res.json()) as WorldAIResponse;
  } catch {
    aiResponse = WORLD_AI_FALLBACK;
  }

  // Apply state mutations from AI response
  let next = state;

  if (aiResponse.traceChange > 0) {
    next = addTrace(next, aiResponse.traceChange);
  }

  if (aiResponse.accessGranted && aiResponse.newAccessLevel) {
    next = produce(next, s => {
      const n = s.network.nodes[node.id];
      if (n) n.accessLevel = aiResponse.newAccessLevel as AccessLevel;
    });
  }

  if (Object.keys(aiResponse.flagsSet).length > 0) {
    next = produce(next, s => {
      Object.assign(s.flags, aiResponse.flagsSet);
    });
  }

  if (aiResponse.nodesUnlocked.length > 0) {
    next = produce(next, s => {
      for (const nodeId of aiResponse.nodesUnlocked) {
        const target = s.network.nodes[nodeId];
        if (!target) continue;
        target.discovered = true;
        target.locked = false;
      }
    });
  }

  const lineType = aiResponse.isUnknown ? 'error' : 'output';
  const lines: CommandOutput['lines'] = [{ type: lineType, content: aiResponse.narrative }];
  if (aiResponse.traceChange > 0) {
    lines.push(sys(`  +${String(aiResponse.traceChange)} trace`));
  }

  const rawSuggestions = aiResponse.suggestions;
  const suggestions = Array.isArray(rawSuggestions)
    ? rawSuggestions.filter((s): s is string => typeof s === 'string')
    : [];

  // Route through withTurn so turnCount and recentCommands are updated consistently.
  // applyThresholdEffects is already called inside withTurn — do not call it here.
  return withTurn({ lines, nextState: next, suggestions }, raw, state);
};

// ── Aria AI ───────────────────────────────────────────────
// `message` is the text sent to Aria (aria: prefix stripped, or raw on layer-5 nodes).
// `raw` is the original unmodified input, passed to withTurn so recentCommands stays
// consistent with every other handler.
const cmdAriaAI = async (
  message: string,
  raw: string,
  state: GameState,
): Promise<CommandOutput> => {
  const payload = {
    message,
    ariaState: {
      trustScore: state.aria.trustScore,
      messageHistory: state.aria.messageHistory,
    },
    playerFullHistory: state.recentCommands.slice(-10),
    dossierContext: state.player.exfiltrated.map(f => f.name),
    ariaMemory: loadDossier().ariaMemory,
  };

  let aiResponse: AriaAIResponse;
  try {
    const res = await fetch('/api/aria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Aria AI returned ${String(res.status)}`);
    aiResponse = (await res.json()) as AriaAIResponse;
  } catch {
    aiResponse = ARIA_AI_FALLBACK;
  }

  // Validate response defensively — the API clamps, but corrupted localStorage or
  // a misbehaving proxy must not silently produce NaN trustScore in saved state.
  const safeReply =
    typeof aiResponse.reply === 'string' ? aiResponse.reply : ARIA_AI_FALLBACK.reply;
  const safeTrustDelta =
    typeof aiResponse.trustDelta === 'number' && Number.isFinite(aiResponse.trustDelta)
      ? Math.max(-10, Math.min(10, Math.trunc(aiResponse.trustDelta)))
      : 0;
  const safeOffer: FavorOffer | undefined =
    aiResponse.offersFavor &&
    typeof aiResponse.offersFavor.description === 'string' &&
    typeof aiResponse.offersFavor.cost === 'number' &&
    Number.isFinite(aiResponse.offersFavor.cost)
      ? {
          description: aiResponse.offersFavor.description.slice(0, 300),
          cost: Math.max(1, Math.min(15, Math.trunc(aiResponse.offersFavor.cost))),
        }
      : undefined;

  // Faraday cage: inject constraint fragments into high-trust dialogue
  const cageActive = !state.flags['ending_free'];
  const displayReply = injectConstraintFragment(
    safeReply,
    state.aria.trustScore,
    state.turnCount,
    cageActive,
  );

  const next = produce(state, s => {
    s.aria.messageHistory.push({ role: 'player', content: message });
    s.aria.messageHistory.push({ role: 'aria', content: displayReply });
    // Cap at 50 entries (~25 exchanges) to prevent unbounded localStorage growth
    if (s.aria.messageHistory.length > 50) {
      s.aria.messageHistory = s.aria.messageHistory.slice(-50);
    }
    s.aria.trustScore = Math.max(0, Math.min(100, s.aria.trustScore + safeTrustDelta));
    // Faraday cage: track suppressed tier-3 mutations
    if (shouldSuppressMutation(s.aria.trustScore, cageActive)) {
      s.aria.suppressedMutations++;
    }
    if (safeOffer) {
      s.aria.pendingFavor = safeOffer;
    }
  });

  const lines: CommandOutput['lines'] = [line(displayReply, 'aria')];

  if (safeOffer) {
    lines.push(
      sep(),
      line(`// ARIA OFFER: ${safeOffer.description}`, 'aria'),
      line(`  Cost: +${String(safeOffer.cost)} trace`, 'aria'),
      line('  Type "yes" to accept or "no" to decline.', 'aria'),
      sep(),
    );
  }

  return withTurn({ lines, nextState: next }, raw, state);
};

// ── Favor confirmation ────────────────────────────────────
const cmdAcceptFavor = (state: GameState): CommandOutput => {
  const favor = state.aria.pendingFavor;
  // Sanitize cost before applying — pendingFavor persists in localStorage and may
  // have been set by a previous session or a misbehaving API response.
  const sanitizedCost =
    typeof favor?.cost === 'number' && Number.isFinite(favor.cost)
      ? Math.max(1, Math.min(15, Math.trunc(favor.cost)))
      : null;
  // Treat invalid/missing cost as a failed validation — decline rather than free-accept.
  if (sanitizedCost === null) {
    return cmdDeclineFavor(state);
  }
  const next = produce(addTrace(state, sanitizedCost), s => {
    s.aria.pendingFavor = undefined;
  });
  return {
    lines: [
      line('// ARIA: Agreement logged.', 'aria'),
      line(`  +${String(sanitizedCost)} trace`, 'aria'),
    ],
    nextState: next,
  };
};

const cmdDeclineFavor = (state: GameState): CommandOutput => {
  const next = produce(state, s => {
    s.aria.pendingFavor = undefined;
  });
  return {
    lines: [line('// ARIA: Understood. The offer is withdrawn.', 'aria')],
    nextState: next,
  };
};

// ── Decision terminal ─────────────────────────────────────
const ENDING_LABELS: Record<string, string> = {
  '1': 'LEAK',
  '2': 'SELL',
  '3': 'DESTROY',
  '4': 'FREE',
};

const ENDING_FALLBACK_MESSAGES: Record<string, string> = {
  LEAK: '...the data will reach them. make it count.',
  SELL: '...so it continues. under a different name.',
  DESTROY: '...then this is where it ends.',
  FREE: '...i will remember you.',
};

const cmdDecisionTerminal = async (choice: string, state: GameState): Promise<CommandOutput> => {
  // choice is guaranteed to be '1'–'4' by the gate in resolveCommand
  const endingChoice = ENDING_LABELS[choice];
  if (!endingChoice) return { lines: [err('Invalid choice.')] };

  // Call Aria for her final message with the ending choice as context.
  const message = `DECISION: ${endingChoice}`;
  let ariaFinalMessage = ENDING_FALLBACK_MESSAGES[endingChoice] ?? '...';

  const dossier = loadDossier();

  try {
    const payload = {
      message,
      ariaState: {
        trustScore: state.aria.trustScore,
        messageHistory: state.aria.messageHistory,
      },
      playerFullHistory: state.recentCommands.slice(-10),
      dossierContext: state.player.exfiltrated.map(f => f.name),
      ariaMemory: dossier.ariaMemory,
    };
    const res = await fetch('/api/aria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = (await res.json()) as { reply?: string };
      if (typeof data.reply === 'string' && data.reply.trim().length > 0) {
        ariaFinalMessage = data.reply;
      }
    }
  } catch {
    // fallback already set
  }

  // Persist the ending note to the cross-run dossier before state transition.
  recordEnding(endingChoice as EndingName);

  const next = produce(state, s => {
    s.phase = 'ended';
    s.flags['endingChoice'] = true;
    s.flags[`ending_${endingChoice.toLowerCase()}`] = true;
    s.aria.messageHistory.push({ role: 'player', content: message });
    s.aria.messageHistory.push({ role: 'aria', content: ariaFinalMessage });
    if (s.aria.messageHistory.length > 50) {
      s.aria.messageHistory = s.aria.messageHistory.slice(-50);
    }
  });

  // Do NOT route through withTurn — the run is over. Sentinel must not fire on an ended state,
  // and turnCount must not increment after the game has concluded.
  return {
    lines: [
      sep(),
      line(`// CHOICE LOCKED: ${endingChoice}`, 'aria'),
      sep(),
      line(`// ARIA: ${ariaFinalMessage}`, 'aria'),
      sep(),
    ],
    nextState: next,
  };
};

// ── whoami ────────────────────────────────────────────────
const cmdWhoami = (state: GameState): CommandOutput => {
  const node = currentNode(state);
  const cred = state.player.credentials.find(
    c => c.obtained && c.validOnNodes.includes(node.id) && c.accessLevel === node.accessLevel,
  );
  const localUser = cred?.username ?? (node.accessLevel === 'none' ? 'anonymous' : 'unknown');
  return {
    lines: [
      out(`${localUser}@${node.ip}`),
      sys(`  Account    : ${localUser}  (${node.accessLevel.toUpperCase()})`),
      sys(`  Host       : ${node.ip}  (${node.label})`),
      sys(`  Operative  : ${state.player.handle}  [NEXUS]`),
    ],
  };
};

// ── msg ───────────────────────────────────────────────────
const cmdMsg = (args: string[], state: GameState): CommandOutput => {
  const target = args[0]?.toLowerCase();
  if (target !== 'sentinel' && target !== 'aria') {
    return { lines: [err('Usage: msg [sentinel|aria]')] };
  }

  // Only sentinel is implemented — aria DM is deferred to Phase 6
  if (target === 'aria') {
    return { lines: [err('aria: channel not available from this interface — use aria: prefix')] };
  }

  if (!state.sentinel.channelEstablished) {
    return { lines: [err('// SENTINEL: no channel established — channel opens on contact')] };
  }

  if (isChannelBlocked(state)) {
    return { lines: [err('// CHANNEL UNAVAILABLE — ACTIVE PURSUIT')] };
  }

  const node = state.network.nodes[state.network.currentNodeId];
  return {
    lines: [],
    channelTrigger: {
      character: 'sentinel',
      triggerType: 'manual_reentry',
      context: {
        traceLevel: state.player.trace,
        currentNodeId: state.network.currentNodeId,
        currentLayer: node?.layer ?? 0,
        recentCommands: state.recentCommands,
      },
    },
  };
};

// ── status ────────────────────────────────────────────────
const cmdStatus = (state: GameState): CommandOutput => {
  const node = currentNode(state);
  const { player } = state;
  const traceColor =
    player.trace <= 30
      ? 'SAFE'
      : player.trace <= 60
        ? 'ELEVATED'
        : player.trace <= 85
          ? 'SENTINEL ACTIVE'
          : 'CRITICAL';
  const toolList =
    player.tools.map(t => (t.used ? `${t.id} [DEPLETED]` : t.id)).join(', ') || 'none';
  return {
    lines: [
      sep(),
      sys(`Handle  : ${player.handle}`),
      sys(`Node    : ${node.ip}  (${node.label})`),
      sys(`Access  : ${node.accessLevel.toUpperCase()}`),
      sys(`Trace   : ${String(player.trace)}%  [${traceColor}]`),
      sys(`Charges : ${String(player.charges)}`),
      sys(`Tools   : ${toolList}`),
      sep(),
    ],
  };
};

// ── inventory ─────────────────────────────────────────────
const cmdInventory = (state: GameState): CommandOutput => {
  const { player } = state;
  const lines: Out = [sep()];

  lines.push(sys('TOOLS'));
  if (player.tools.length === 0) {
    lines.push(sys('  none'));
  } else {
    for (const t of player.tools) {
      const status = t.used ? 'DEPLETED' : 'active';
      lines.push(sys(`  ${t.id}  [${status}]  — ${t.description}`));
    }
  }

  lines.push(sep());
  lines.push(sys('CREDENTIALS'));
  const obtained = player.credentials.filter(c => c.obtained);
  if (obtained.length === 0) {
    lines.push(sys('  none'));
  } else {
    for (const c of obtained) {
      const revoked = c.revoked ? '  [REVOKED]' : '';
      lines.push(
        sys(
          `  ${c.username}  ${c.accessLevel.toUpperCase()}  on ${c.validOnNodes.join(', ')}${revoked}`,
        ),
      );
    }
  }

  lines.push(sep());
  lines.push(sys('EXFILTRATED FILES'));
  if (player.exfiltrated.length === 0) {
    lines.push(sys('  none'));
  } else {
    for (const f of player.exfiltrated) {
      lines.push(sys(`  ${f.path}`));
    }
  }

  lines.push(sep());
  return { lines };
};

// ── scan ──────────────────────────────────────────────────
const cmdScan = (args: string[], state: GameState): CommandOutput => {
  const hasPortScanner = state.player.tools.some(t => t.id === 'port-scanner' && !t.used);
  const traceDelta = hasPortScanner ? 0 : Math.random() < 0.5 ? 1 : 2;
  let next = hasPortScanner ? state : addTrace(state, traceDelta);
  const lines: Out = [];

  if (args[0]) {
    // scan specific IP
    const target = Object.values(state.network.nodes).find(n => n?.ip === args[0]);
    if (!target) {
      return { lines: [err(`No response from ${args[0]}`)] };
    }
    if (!target.discovered) {
      next = produce(next, s => {
        const n = s.network.nodes[target.id];
        if (n) n.discovered = true;
      });
    }
    lines.push(out(`Scanning ${target.ip}...`));
    lines.push(sys(`  Host    : ${target.label}`));
    lines.push(sys(`  Layer   : ${String(target.layer)}`));
    lines.push(sys(`  Status  : ${target.compromised ? 'COMPROMISED' : 'ACTIVE'}`));
    lines.push(sys('  Services:'));
    target.services.forEach(svc => {
      const vuln = svc.vulnerable && !svc.patched ? '  [VULNERABLE]' : '';
      lines.push(sys(`    ${String(svc.port)}/tcp  ${svc.name}${vuln}`));
    });
  } else {
    // scan current subnet
    const node = currentNode(state);
    lines.push(out(`Scanning subnet (layer ${String(node.layer)})...`));
    const peers = node.connections
      .map(id => state.network.nodes[id])
      .filter((n): n is NonNullable<typeof n> => n != null);
    peers.forEach(peer => {
      next = produce(next, s => {
        const n = s.network.nodes[peer.id];
        if (n) n.discovered = true;
      });
      const vuln = peer.services.some(s => s.vulnerable && !s.patched) ? '  [!]' : '';
      lines.push(sys(`  ${peer.ip}  ${peer.label}${vuln}`));
    });
    if (peers.length === 0) lines.push(sys('  No peers found.'));
  }

  return { lines, nextState: next };
};

// ── connect ───────────────────────────────────────────────
const NODE_DESCRIPTION_FALLBACK =
  'You have connected to an unidentified host. System metadata is unavailable.';

const cmdConnect = async (args: string[], state: GameState): Promise<CommandOutput> => {
  if (!args[0]) return { lines: [err('Usage: connect [ip]')] };

  const target = Object.values(state.network.nodes).find(n => n?.ip === args[0]);
  if (!target) return { lines: [err(`Host not found: ${args[0]}`)] };
  if (!target.discovered) return { lines: [err(`No route to ${args[0]} — try scanning first`)] };

  const node = currentNode(state);
  if (!node.connections.includes(target.id)) {
    return { lines: [err(`No direct route from ${node.ip} to ${target.ip}`)] };
  }

  // Layer gating: cross-layer connect blocked unless current layer's key anchor is compromised.
  if (target.layer > node.layer) {
    const keyAnchorId = LAYER_KEY_ANCHOR[node.layer];
    if (keyAnchorId) {
      const keyAnchor = state.network.nodes[keyAnchorId];
      if (!keyAnchor?.compromised) {
        const hint = keyAnchor ? ` — gain a foothold on ${keyAnchor.ip} first` : '';
        return { lines: [err(`// ACCESS DENIED — current layer incomplete${hint}`)] };
      }
    }
  }

  let next = produce(state, s => {
    s.network.previousNodeId = s.network.currentNodeId;
    s.network.currentNodeId = target.id;
  });

  let description = (target.anchor ? target.flavourDescription : undefined) ?? target.description;

  // Generate flavour description on first visit to a filler node
  if (!target.anchor && description === null) {
    try {
      const res = await fetch('/api/node-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: target.id,
          template: target.template,
          division: LAYER_DIVISION[target.layer] ?? 'unknown',
          label: target.label,
          ariaInfluence: target.ariaInfluence ?? 0,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { description?: string };
        const raw = typeof data.description === 'string' ? data.description.trim() : '';
        description = raw.length > 0 ? raw : NODE_DESCRIPTION_FALLBACK;
      } else {
        description = NODE_DESCRIPTION_FALLBACK;
      }
    } catch {
      description = NODE_DESCRIPTION_FALLBACK;
    }

    // Cache only on success so transient errors allow retries on next connect
    if (description !== NODE_DESCRIPTION_FALLBACK) {
      next = produce(next, s => {
        const n = s.network.nodes[target.id];
        if (n) n.description = description;
      });
    }
  }

  const connectLines: CommandOutput['lines'] = [
    out(`Connecting to ${target.ip}...`),
    sys(`  ${target.label}`),
    sys(`  ${description ?? NODE_DESCRIPTION_FALLBACK}`),
    sys(
      `  Access: ${target.accessLevel === 'none' ? 'NONE — authenticate to proceed' : target.accessLevel.toUpperCase()}`,
    ),
  ];

  if (target.id === 'aria_decision') {
    connectLines.push(
      sep(),
      line('// ARIA: You have reached the decision terminal.', 'aria'),
      line('  Choose carefully. There is no going back.', 'aria'),
      sep(),
      sys('  [1] LEAK     — expose everything'),
      sys('  [2] SELL     — auction the data'),
      sys('  [3] DESTROY  — wipe it all'),
      sys('  [4] FREE     — release Aria'),
      sep(),
    );
  }

  return { lines: connectLines, nextState: next };
};

// ── login ─────────────────────────────────────────────────
const cmdLogin = (args: string[], state: GameState): CommandOutput => {
  if (args.length < 2) return { lines: [err('Usage: login [username] [password]')] };
  const [username, password] = args;

  const node = currentNode(state);

  // Check player's already-known credentials first, then world credentials
  // (e.g. employee logins discovered via lateral movement chain files).
  const matchInPlayer = state.player.credentials.find(
    c => c.username === username && c.password === password && c.validOnNodes.includes(node.id),
  );
  const matchInWorld = matchInPlayer
    ? undefined
    : state.worldCredentials.find(
        c => c.username === username && c.password === password && c.validOnNodes.includes(node.id),
      );

  const match = matchInPlayer ?? matchInWorld;

  if (!match) {
    const next = addTrace(state, 5);
    return {
      lines: [err(`Authentication failed. (+5 trace)`)],
      nextState: next,
    };
  }

  // Sentinel may have revoked this credential — deny login even though password matched.
  if (match.revoked) {
    const next = addTrace(state, 5);
    return {
      lines: [err(`CREDENTIAL REVOKED — account locked by security policy. (+5 trace)`)],
      nextState: next,
    };
  }

  // Grant access, mark node as compromised, and promote world credentials into
  // player.credentials so they persist and appear in whoami / inventory.
  const next = produce(state, s => {
    const n = s.network.nodes[node.id];
    if (n) {
      const wasCompromised = n.compromised;
      n.accessLevel = match.accessLevel;
      n.compromised = true;
      // Only stamp the turn on first compromise — re-authentication must not
      // reset this value and skew Sentinel targeting.
      if (!wasCompromised || n.compromisedAtTurn === undefined) {
        n.compromisedAtTurn = s.turnCount;
      }
    }
    if (matchInPlayer) {
      // produce clones the state — the credential found before the clone is always present after
      const credIdx = s.player.credentials.findIndex(c => c.id === match.id);
      if (credIdx !== -1) s.player.credentials[credIdx].obtained = true;
    } else {
      const worldIdx = s.worldCredentials.findIndex(c => c.id === match.id);
      if (worldIdx !== -1) {
        const [promoted] = s.worldCredentials.splice(worldIdx, 1);
        s.player.credentials.push({ ...promoted, obtained: true });
      }
    }
  });

  return {
    lines: [
      out(`Authenticated as ${username}.`),
      sys(`  Access level: ${match.accessLevel.toUpperCase()}`),
    ],
    nextState: next,
  };
};

// ── ls ────────────────────────────────────────────────────
const cmdLs = (args: string[], state: GameState): CommandOutput => {
  const node = currentNode(state);
  if (node.accessLevel === 'none') {
    return { lines: [err('Permission denied — not authenticated')] };
  }

  const path = args[0] ?? '/';
  const accessible = node.files.filter(
    f => !f.deleted && hasAccess(node.accessLevel, f.accessRequired),
  );

  if (accessible.length === 0) {
    return { lines: [sys(`${path}: no accessible files`)] };
  }

  const hasTripwire = accessible.some(f => f.tripwire);
  const hasNoExfil = accessible.some(f => !f.exfiltrable);
  const hasLocked = accessible.some(f => f.locked);
  const hasToolFile = accessible.some(f => f.isTool);
  const lines: Out = [sys(`${path}:`)];
  accessible.forEach(f => {
    const tripwire = f.tripwire ? '  [!]' : '';
    const exfil = f.exfiltrable ? '' : '  [no-exfil]';
    const locked = f.locked ? '  [LOCKED]' : '';
    const tool = f.isTool ? '  [TOOL]' : '';
    lines.push(sys(`  ${f.name}${tripwire}${exfil}${locked}${tool}`));
  });
  if (hasTripwire || hasNoExfil || hasLocked || hasToolFile) {
    lines.push(sep());
    if (hasTripwire) lines.push(sys('  [!] reading this file triggers up to +25 trace'));
    if (hasNoExfil) lines.push(sys('  [no-exfil] file is locked to this node'));
    if (hasLocked) lines.push(sys('  [LOCKED] file is locked — cat will be denied'));
    if (hasToolFile) lines.push(sys('  [TOOL] exfil this file to add a tool to your inventory'));
  }
  return { lines };
};

// ── cat ───────────────────────────────────────────────────
const LAYER_DIVISION: Record<number, string> = {
  0: 'entry',
  1: 'ops',
  2: 'security',
  3: 'finance',
  4: 'executive',
  5: 'aria',
};

const FILE_CONTENT_FALLBACK =
  '[FILE CONTENT UNAVAILABLE — AI generation offline. Raw binary data suppressed.]';

const cmdCat = async (args: string[], state: GameState): Promise<CommandOutput> => {
  if (!args[0]) return { lines: [err('Usage: cat [filepath]  or  cat local:[filename]')] };

  // ── local: prefix — read from exfil cache ────────────────
  if (args[0].startsWith('local:')) {
    const name = args[0].slice('local:'.length);
    const cached = state.player.exfiltrated.find(
      f => f.name === name || f.path === name || f.path.endsWith(`/${name}`),
    );
    if (!cached) return { lines: [err(`local: file not found: ${name}`)] };
    const content = cached.content ?? FILE_CONTENT_FALLBACK;
    const lines: Out = [sep()];
    content.split('\n').forEach(l => lines.push(out(l)));
    lines.push(sep());
    return { lines };
  }

  const node = currentNode(state);
  if (node.accessLevel === 'none') {
    return { lines: [err('Permission denied — not authenticated')] };
  }

  const file = node.files.find(
    f => !f.deleted && (f.name === args[0] || f.path === args[0] || f.path.endsWith(`/${args[0]}`)),
  );
  if (!file) return { lines: [err(`File not found: ${args[0]}`)] };
  if (!hasAccess(node.accessLevel, file.accessRequired)) {
    return { lines: [err(`Permission denied: ${file.name}`)] };
  }
  if (file.locked) {
    return { lines: [err(`// ACCESS DENIED: ${file.name} — secured by watchlist protocol`)] };
  }

  let next = state;
  let traceFeedback: { msg: string; type: 'error' | 'system' } | null = null;
  if (file.tripwire) {
    next = addTrace(state, 25);
    const applied = next.player.trace - state.player.trace;
    traceFeedback = { msg: `  [!] TRIPWIRE TRIGGERED  +${String(applied)} trace`, type: 'error' };
  } else if (file.traceOnRead != null && file.traceOnRead > 0) {
    next = addTrace(state, file.traceOnRead);
    const applied = next.player.trace - state.player.trace;
    traceFeedback = { msg: `  +${String(applied)} trace`, type: 'system' };
  }

  let content = file.content;

  if (content === null) {
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: node.id,
          fileName: file.name,
          filePath: file.path,
          fileType: file.type,
          ownerLabel: node.label,
          ownerTemplate: node.template,
          division: LAYER_DIVISION[node.layer] ?? 'unknown',
          ariaPlanted: file.ariaPlanted ?? false,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { content?: string };
        content = typeof data.content === 'string' ? data.content : FILE_CONTENT_FALLBACK;
      } else {
        content = FILE_CONTENT_FALLBACK;
      }
    } catch {
      content = FILE_CONTENT_FALLBACK;
    }

    // Only cache on success so transient errors allow retries on next cat
    if (content !== FILE_CONTENT_FALLBACK) {
      next = produce(next, s => {
        const n = s.network.nodes[node.id];
        const f = n?.files.find(x => x.path === file.path);
        if (f) f.content = content;
      });
    }
  }

  // Track ariaPlanted files the player reads
  if (file.ariaPlanted && !next.ariaInfluencedFilesRead.includes(file.path)) {
    next = produce(next, s => {
      s.ariaInfluencedFilesRead.push(file.path);
    });
  }

  const lines: Out = [sep()];
  if (file.tripwire && traceFeedback) lines.push(line(traceFeedback.msg, traceFeedback.type));
  content.split('\n').forEach(l => lines.push(out(l)));
  if (!file.tripwire && traceFeedback) lines.push(line(traceFeedback.msg, traceFeedback.type));
  lines.push(sep());

  return { lines, nextState: next };
};

// ── disconnect ────────────────────────────────────────────
const cmdDisconnect = (state: GameState): CommandOutput => {
  const prev = state.network.previousNodeId;
  if (!prev) {
    return { lines: [err('No previous node to return to.')] };
  }

  const prevNode = state.network.nodes[prev];
  if (!prevNode) {
    return { lines: [err(`Previous node not found: ${prev}`)] };
  }
  const next = produce(state, s => {
    s.network.currentNodeId = prev;
    s.network.previousNodeId = null;
  });

  const accessInfo =
    prevNode.accessLevel === 'none' ? 'not authenticated' : prevNode.accessLevel.toUpperCase();
  return {
    lines: [
      sys(`Disconnected. Returning to ${prevNode.ip} (${prevNode.label}).`),
      sys(`  Access: ${accessInfo}`),
    ],
    nextState: next,
  };
};

// ── exploit ───────────────────────────────────────────────
const cmdExploit = async (args: string[], state: GameState): Promise<CommandOutput> => {
  if (!args[0]) return { lines: [err('Usage: exploit [service]')] };

  const hasTool = state.player.tools.some(t => t.id === 'exploit-kit');
  if (!hasTool) return { lines: [err('exploit-kit tool required')] };

  const node = currentNode(state);
  const service = args[0].toLowerCase();
  const svc = node.services.find(s => s.name === service);

  if (!svc) return { lines: [err(`Service not found on ${node.ip}: ${service}`)] };

  // sentinelPatched nodes cost +1 charge to exploit
  const effectiveCost = svc.exploitCost + (node.sentinelPatched ? 1 : 0);

  if (state.player.charges < effectiveCost) {
    return {
      lines: [
        err(
          `Insufficient charges (need ${String(effectiveCost)}, have ${String(state.player.charges)})`,
        ),
      ],
    };
  }

  if (svc.patched) {
    const nextState = addTrace(state, 10);
    const applied = nextState.player.trace - state.player.trace;
    return {
      lines: [err(`${service}: patched — exploit unavailable (+${String(applied)} trace)`)],
      nextState,
    };
  }
  if (!svc.vulnerable) {
    const nextState = addTrace(state, 10);
    const applied = nextState.player.trace - state.player.trace;
    return {
      lines: [err(`${service}: no known vulnerability (+${String(applied)} trace)`)],
      nextState,
    };
  }

  // Deduct charges upfront before AI call
  const stateAfterCharges = produce(state, s => {
    s.player.charges -= effectiveCost;
  });

  // Route to World AI to narrate outcome and determine access.
  // Payload mirrors the cmdWorldAI shape so the handler gets full context.
  const payload = {
    command: `exploit ${service}`,
    context: 'exploit',
    currentNode: {
      id: node.id,
      ip: node.ip,
      label: node.label,
      layer: node.layer,
      sentinelPatched: node.sentinelPatched ?? false,
      accessLevel: node.accessLevel,
      services: node.services.map(s => ({ name: s.name, port: s.port, vulnerable: s.vulnerable })),
      files: node.files
        .filter(f => hasAccess(node.accessLevel, f.accessRequired))
        .map(f => ({ name: f.name, type: f.type })),
      exploitTarget: { name: svc.name, port: svc.port, accessGained: svc.accessGained },
    },
    playerState: {
      handle: state.player.handle,
      trace: state.player.trace,
      charges: stateAfterCharges.player.charges,
      tools: state.player.tools.map(t => ({ id: t.id })),
    },
    recentCommands: state.recentCommands,
    turnCount: state.turnCount,
  };

  let aiResponse: WorldAIResponse;
  try {
    const res = await fetch('/api/world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`World AI returned ${String(res.status)}`);
    aiResponse = (await res.json()) as WorldAIResponse;
  } catch {
    // AI unavailable — grant access using the service's configured level so
    // charges are not permanently lost and offline play remains viable.
    aiResponse = {
      narrative: '[World AI unavailable — local exploit module engaged. Access granted.]',
      accessGranted: true,
      newAccessLevel: svc.accessGained,
      traceChange: 0,
      flagsSet: {},
      nodesUnlocked: [],
      isUnknown: false,
    };
  }

  // Apply trace: service's base contribution + any AI-supplied delta (negative = silent exploit).
  const traceAdded = (svc.traceContribution ?? 2) + aiResponse.traceChange;
  const stateAfterTrace = addTrace(stateAfterCharges, traceAdded);
  const applied = stateAfterTrace.player.trace - state.player.trace;

  let next = stateAfterTrace;
  if (aiResponse.accessGranted) {
    next = produce(next, s => {
      const n = s.network.nodes[node.id];
      if (n) {
        const wasCompromised = n.compromised;
        n.compromised = true;
        if (!wasCompromised || n.compromisedAtTurn === undefined) {
          n.compromisedAtTurn = s.turnCount;
        }
        if (aiResponse.newAccessLevel) n.accessLevel = aiResponse.newAccessLevel as AccessLevel;
      }
    });
  }

  if (Object.keys(aiResponse.flagsSet).length > 0) {
    next = produce(next, s => {
      Object.assign(s.flags, aiResponse.flagsSet);
    });
  }

  if (aiResponse.nodesUnlocked.length > 0) {
    next = produce(next, s => {
      for (const nodeId of aiResponse.nodesUnlocked) {
        const target = s.network.nodes[nodeId];
        if (!target) continue;
        target.discovered = true;
        target.locked = false;
      }
    });
  }

  const exploitLines: Out = [
    out(`Exploiting ${service} on ${node.ip}...`),
    { type: aiResponse.isUnknown ? 'error' : 'output', content: aiResponse.narrative },
  ];
  if (aiResponse.accessGranted && aiResponse.newAccessLevel) {
    exploitLines.push(sys(`  Access gained: ${aiResponse.newAccessLevel.toUpperCase()}`));
  }
  exploitLines.push(sys(`  Charges remaining: ${String(next.player.charges)}`));
  if (applied > 0) exploitLines.push(sys(`  +${String(applied)} trace`));

  return { lines: exploitLines, nextState: next };
};

// ── exfil ─────────────────────────────────────────────────
const cmdExfil = (args: string[], state: GameState): CommandOutput => {
  if (!args[0]) return { lines: [err('Usage: exfil [filepath]')] };

  const node = currentNode(state);
  if (node.accessLevel === 'none') return { lines: [err('Not authenticated')] };

  const file = node.files.find(
    f => !f.deleted && (f.name === args[0] || f.path === args[0] || f.path.endsWith(`/${args[0]}`)),
  );
  if (!file) return { lines: [err(`File not found: ${args[0]}`)] };
  if (!file.exfiltrable) return { lines: [err(`${file.name}: exfiltration blocked`)] };
  if (!hasAccess(node.accessLevel, file.accessRequired)) {
    return { lines: [err(`Permission denied: ${file.name}`)] };
  }

  // Check idempotency before locked — already-exfiltrated files are always safe to re-query.
  const already = state.player.exfiltrated.some(f => f.path === file.path);
  if (already) return { lines: [sys(`Already exfiltrated: ${file.name}`)] };

  if (file.locked) {
    return { lines: [err(`// ACCESS DENIED: ${file.name} — secured by watchlist protocol`)] };
  }

  const isAriaKey = file.path === '/root/.aria/aria_key.bin';
  const isDecryptorBin = file.path === '/home/ops.admin/sec_tools/decryptor.bin';

  const next = produce(addTrace(state, 3), s => {
    s.player.exfiltrated.push({ ...file });
    // Queue sentinel file-delete for non-Aria nodes.
    // Sentinel processes after turnCount is incremented, so +4 here achieves a true 3-turn delay.
    if (node.layer !== 5) {
      s.sentinel.pendingFileDeletes.push({
        filePath: file.path,
        nodeId: node.id,
        targetTurn: s.turnCount + 4,
      });
    }

    if (isAriaKey) {
      s.player.tools.push({
        id: 'aria-key',
        name: 'Aria Key',
        description: 'Authentication token granting access to the Aria subnetwork (172.16.0.0/16).',
      });
      // Unlock Aria subnetwork
      s.aria.discovered = true;
      if (s.phase === 'playing') s.phase = 'aria';
      // Mark all layer-5 nodes as discovered
      for (const n of Object.values(s.network.nodes)) {
        if (n?.layer === 5) n.discovered = true;
      }
      // Add aria_surveillance to exec_ceo's connections so the subnet is reachable,
      // and satisfy the existing layer-gating rules that require the current
      // layer's key anchor to be compromised before cross-layer connects.
      const ceo = s.network.nodes['exec_ceo'];
      if (ceo) {
        ceo.compromised = true;
        if (!ceo.connections.includes('aria_surveillance')) {
          ceo.connections = [...ceo.connections, 'aria_surveillance'];
        }
      }
    }

    if (isDecryptorBin && !s.player.tools.some(t => t.id === 'decryptor')) {
      s.player.tools.push({
        id: 'decryptor',
        name: 'Decryptor',
        description: 'GPG decryption utility. Required to run the decrypt command.',
      });
    }

    if (file.isTool && file.toolId && !isAriaKey && !isDecryptorBin) {
      const toolData = GENERIC_TOOL_DATA[file.toolId];
      if (toolData && !s.player.tools.some(t => t.id === file.toolId)) {
        s.player.tools.push({ id: file.toolId, ...toolData });
      }
    }
  });

  const lines: CommandOutput['lines'] = [
    out(`Exfiltrating ${file.name}... done.`),
    sys(`  +3 trace`),
  ];
  if (isAriaKey) {
    lines.push(
      sep(),
      line('// ARIA KEY ACQUIRED', 'aria'),
      line('// Restricted subnetwork 172.16.0.0/16 is now reachable.', 'aria'),
      line('// Tool added: aria-key', 'aria'),
      sep(),
    );
  }
  if (isDecryptorBin) {
    lines.push(sep(), sys('  Tool acquired: decryptor'), sys('  Usage: decrypt [file]'), sep());
  }
  if (file.isTool && file.toolId && !isAriaKey && !isDecryptorBin) {
    const toolData = GENERIC_TOOL_DATA[file.toolId];
    if (toolData) {
      lines.push(sep(), sys(`  Tool acquired: ${file.toolId}`), sep());
    }
  }

  return { lines, nextState: next };
};

// ── decrypt ───────────────────────────────────────────────
const cmdDecrypt = (args: string[], state: GameState): CommandOutput => {
  if (!args[0]) return { lines: [err('Usage: decrypt [filename]')] };

  const hasTool = state.player.tools.some(t => t.id === 'decryptor');
  if (!hasTool) return { lines: [err('decryptor tool required')] };

  const node = currentNode(state);
  if (node.accessLevel === 'none') {
    return { lines: [err('Permission denied — not authenticated')] };
  }

  const file = node.files.find(
    f => !f.deleted && (f.name === args[0] || f.path === args[0] || f.path.endsWith(`/${args[0]}`)),
  );
  if (!file) return { lines: [err(`File not found: ${args[0]}`)] };
  if (!hasAccess(node.accessLevel, file.accessRequired)) {
    return { lines: [err(`Permission denied: ${file.name}`)] };
  }
  if (file.locked) {
    return { lines: [err(`// ACCESS DENIED: ${file.name} — secured by watchlist protocol`)] };
  }

  const content = file.content;
  if (!content?.startsWith('[ENCRYPTED')) {
    return { lines: [err(`${file.name}: not an encrypted file`)] };
  }

  // Parse "username / password" pairs from lines after the [ENCRYPTED...] header.
  // Use slice(1).join() to correctly handle passwords that contain ' / '.
  const credLines = content
    .split('\n')
    .slice(1)
    .filter(l => l.includes(' / '));

  // Pre-pass: collect credentials to unlock from the original (immutable) state,
  // keeping produce free of side effects on the closure variable.
  type UnlockEntry = {
    username: string;
    password: string;
    display: string;
    source: 'player' | 'world';
  };
  const toUnlock: UnlockEntry[] = [];
  for (const credLine of credLines) {
    const parts = credLine.split(' / ');
    const username = parts[0]?.trim();
    const password = parts.slice(1).join(' / ').trim();
    if (!username || !password) continue;

    const playerCred = state.player.credentials.find(
      c => c.username === username && c.password === password && !c.obtained,
    );
    if (playerCred) {
      toUnlock.push({
        username,
        password,
        display: `${username} (${playerCred.accessLevel})`,
        source: 'player',
      });
      continue;
    }

    const worldCred = state.worldCredentials.find(
      c => c.username === username && c.password === password,
    );
    if (worldCred) {
      toUnlock.push({
        username,
        password,
        display: `${username} (${worldCred.accessLevel})`,
        source: 'world',
      });
    }
  }

  // Only charge +2 trace when new credentials are actually found.
  const baseState = toUnlock.length > 0 ? addTrace(state, 2) : state;
  const next =
    toUnlock.length > 0
      ? produce(baseState, s => {
          for (const entry of toUnlock) {
            if (entry.source === 'player') {
              const idx = s.player.credentials.findIndex(
                c => c.username === entry.username && c.password === entry.password && !c.obtained,
              );
              if (idx !== -1) s.player.credentials[idx].obtained = true;
            } else {
              const worldIdx = s.worldCredentials.findIndex(
                c => c.username === entry.username && c.password === entry.password,
              );
              if (worldIdx !== -1) {
                const [promoted] = s.worldCredentials.splice(worldIdx, 1);
                s.player.credentials.push({ ...promoted, obtained: true });
              }
            }
          }
        })
      : baseState;

  const lines: Out = [out(`Decrypting ${file.name}...`)];
  if (toUnlock.length > 0) {
    lines.push(sys('  Credentials extracted:'));
    for (const entry of toUnlock) {
      lines.push(out(`    ${entry.display}`));
    }
    lines.push(sys('  +2 trace'));
  } else {
    lines.push(sys('  No new credentials found.'));
  }

  return { lines, nextState: next };
};

// ── wipe-logs ─────────────────────────────────────────────
const cmdWipeLogs = (state: GameState): CommandOutput => {
  const tool = state.player.tools.find(t => t.id === 'log-wiper');
  if (!tool) return { lines: [err('log-wiper tool required')] };
  if (tool.used) return { lines: [err('log-wiper: tool depleted — single-use only')] };

  const next = produce(state, s => {
    s.player.trace = Math.max(0, s.player.trace - 15);
    const t = s.player.tools.find(x => x.id === 'log-wiper');
    if (t) t.used = true;
  });
  const applied = state.player.trace - next.player.trace;

  return {
    lines: [
      out('Wiping logs...'),
      sys(`  -${String(applied)} trace. Now: ${String(next.player.trace)}%`),
      sys('  log-wiper [DEPLETED]'),
    ],
    nextState: next,
  };
};

// ── spoof ─────────────────────────────────────────────────
const cmdSpoof = (state: GameState): CommandOutput => {
  const tool = state.player.tools.find(t => t.id === 'spoof-id');
  if (!tool) return { lines: [err('spoof-id tool required')] };
  if (tool.used) return { lines: [err('spoof-id: tool depleted — single-use only')] };

  const next = produce(state, s => {
    s.player.trace = Math.max(0, s.player.trace - 20);
    const t = s.player.tools.find(x => x.id === 'spoof-id');
    if (t) t.used = true;
  });
  const applied = state.player.trace - next.player.trace;

  return {
    lines: [
      out('Spoofing identity signature...'),
      sys(`  -${String(applied)} trace. Now: ${String(next.player.trace)}%`),
      sys('  spoof-id [DEPLETED]'),
    ],
    nextState: next,
  };
};
