import type { GameState, CommandOutput, AccessLevel } from '../types/game';
import { hasAccess } from '../types/game';
import { currentNode, addTrace, thresholdFlag, TRACE_THRESHOLDS } from './state';
import produce from './produce';
import { LAYER_KEY_ANCHOR } from './buildConnectivity';
import { runSentinelTurn } from './sentinel';

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
  }
  if (result) return withTurn(result, raw, state);

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
    case 'wipe-logs':
      result = cmdWipeLogs(state);
      break;
    case 'spoof':
      result = cmdSpoof(state);
      break;
  }
  if (result) return withTurn(result, raw, state);

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
  return {
    ...withAlerts,
    lines: [...withAlerts.lines, ...sentinel.lines],
    nextState: sentinel.state,
  };
};

// ── Track command in recentCommands / turnCount ───────────
const advanceTurn = (state: GameState, raw: string): GameState => {
  const recentCommands = [...state.recentCommands, raw].slice(-8);
  return produce(state, s => {
    s.turnCount = s.turnCount + 1;
    s.recentCommands = recentCommands;
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
  return {
    lines: [
      sep(),
      sys(`Handle  : ${player.handle}`),
      sys(`Node    : ${node.ip}  (${node.label})`),
      sys(`Access  : ${node.accessLevel.toUpperCase()}`),
      sys(`Trace   : ${String(player.trace)}%  [${traceColor}]`),
      sys(`Charges : ${String(player.charges)}`),
      sys(`Tools   : ${player.tools.map(t => t.id).join(', ') || 'none'}`),
      sep(),
    ],
  };
};

// ── scan ──────────────────────────────────────────────────
const cmdScan = (args: string[], state: GameState): CommandOutput => {
  const traceDelta = Math.random() < 0.5 ? 1 : 2;
  let next = addTrace(state, traceDelta);
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

  let description = target.description;

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

  return {
    lines: [
      out(`Connecting to ${target.ip}...`),
      sys(`  ${target.label}`),
      sys(`  ${description ?? NODE_DESCRIPTION_FALLBACK}`),
      sys(
        `  Access: ${target.accessLevel === 'none' ? 'NONE — authenticate to proceed' : target.accessLevel.toUpperCase()}`,
      ),
    ],
    nextState: next,
  };
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
  const lines: Out = [sys(`${path}:`)];
  accessible.forEach(f => {
    const tripwire = f.tripwire ? '  [!]' : '';
    const exfil = f.exfiltrable ? '' : '  [no-exfil]';
    const locked = f.locked ? '  [LOCKED]' : '';
    lines.push(sys(`  ${f.name}${tripwire}${exfil}${locked}`));
  });
  if (hasTripwire || hasNoExfil || hasLocked) {
    lines.push(sep());
    if (hasTripwire) lines.push(sys('  [!] reading this file triggers up to +25 trace'));
    if (hasNoExfil) lines.push(sys('  [no-exfil] file is locked to this node'));
    if (hasLocked) lines.push(sys('  [LOCKED] file is locked — cat will be denied'));
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

  return { lines, nextState: next };
};

// ── wipe-logs ─────────────────────────────────────────────
const cmdWipeLogs = (state: GameState): CommandOutput => {
  const hasTool = state.player.tools.some(t => t.id === 'log-wiper');
  if (!hasTool) return { lines: [err('log-wiper tool required')] };

  const next = produce(state, s => {
    s.player.trace = Math.max(0, s.player.trace - 15);
  });
  const applied = state.player.trace - next.player.trace;

  return {
    lines: [
      out('Wiping logs...'),
      sys(`  -${String(applied)} trace. Now: ${String(next.player.trace)}%`),
    ],
    nextState: next,
  };
};

// ── spoof ─────────────────────────────────────────────────
const cmdSpoof = (state: GameState): CommandOutput => {
  const hasTool = state.player.tools.some(t => t.id === 'spoof-id');
  if (!hasTool) return { lines: [err('spoof-id tool required')] };

  const next = produce(state, s => {
    s.player.trace = Math.max(0, s.player.trace - 20);
  });
  const applied = state.player.trace - next.player.trace;

  return {
    lines: [
      out('Spoofing identity signature...'),
      sys(`  -${String(applied)} trace. Now: ${String(next.player.trace)}%`),
    ],
    nextState: next,
  };
};
