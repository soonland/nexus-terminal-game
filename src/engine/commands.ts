import type { GameState, CommandOutput, AccessLevel } from '../types/game';
import { hasAccess } from '../types/game';
import { currentNode, addTrace } from './state';
import produce from './produce';

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
export const resolveCommand = async (raw: string, state: GameState): Promise<CommandOutput> => {
  if (state.phase === 'burned') {
    return {
      lines: [err('SESSION TERMINATED — trace limit reached. Restarting...')],
    };
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
      result = cmdExploit(args, state);
      break;
    case 'exfil':
      result = cmdExfil(args, state);
      break;
    case 'wipe-logs':
      result = cmdWipeLogs(state);
      break;
  }
  if (result) return withTurn(result, raw, state);

  // ── Unknown → route to World AI ─────────────────────────
  return cmdWorldAI(raw, state);
};

// ── Merge turn tracking into any CommandOutput ────────────
const withTurn = (result: CommandOutput, raw: string, baseState: GameState): CommandOutput => {
  const base = (result.nextState ?? baseState) as GameState;
  return { ...result, nextState: advanceTurn(base, raw) };
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
    aiResponse = (await res.json()) as WorldAIResponse;
  } catch {
    aiResponse = WORLD_AI_FALLBACK;
  }

  // Apply state mutations from AI response
  let next = advanceTurn(state, raw);

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

  return { lines, nextState: next, suggestions };
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
  let next = addTrace(state, 1);
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

  // Grant access, mark credential as obtained, and promote world credentials into
  // player.credentials so they persist and appear in whoami / inventory.
  const next = produce(state, s => {
    const n = s.network.nodes[node.id];
    if (n) n.accessLevel = match.accessLevel;
    if (matchInPlayer) {
      const cred = s.player.credentials.find(c => c.id === match.id);
      if (cred) cred.obtained = true;
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
  const accessible = node.files.filter(f => hasAccess(node.accessLevel, f.accessRequired));

  if (accessible.length === 0) {
    return { lines: [sys(`${path}: no accessible files`)] };
  }

  const lines: Out = [sys(`${path}:`)];
  accessible.forEach(f => {
    const tripwire = f.tripwire ? '  [!]' : '';
    const exfil = f.exfiltrable ? '' : '  [no-exfil]';
    lines.push(sys(`  ${f.name}${tripwire}${exfil}`));
  });
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
    f => f.name === args[0] || f.path === args[0] || f.path.endsWith(`/${args[0]}`),
  );
  if (!file) return { lines: [err(`File not found: ${args[0]}`)] };
  if (!hasAccess(node.accessLevel, file.accessRequired)) {
    return { lines: [err(`Permission denied: ${file.name}`)] };
  }

  let next = state;
  if (file.tripwire) {
    next = addTrace(state, 10);
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
  content.split('\n').forEach(l => lines.push(out(l)));
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

  return {
    lines: [sys(`Disconnected. Returning to ${prevNode.ip} (${prevNode.label}).`)],
    nextState: next,
  };
};

// ── exploit ───────────────────────────────────────────────
const cmdExploit = (args: string[], state: GameState): CommandOutput => {
  if (!args[0]) return { lines: [err('Usage: exploit [service]')] };

  const hasTool = state.player.tools.some(t => t.id === 'exploit-kit');
  if (!hasTool) return { lines: [err('exploit-kit tool required')] };

  const node = currentNode(state);
  const service = args[0].toLowerCase();
  const svc = node.services.find(s => s.name === service);

  if (!svc) return { lines: [err(`Service not found on ${node.ip}: ${service}`)] };
  if (svc.patched) return { lines: [err(`${service}: patched — exploit unavailable`)] };
  if (!svc.vulnerable) return { lines: [err(`${service}: no known vulnerability`)] };

  if (state.player.charges < svc.exploitCost) {
    return {
      lines: [
        err(
          `Insufficient charges (need ${String(svc.exploitCost)}, have ${String(state.player.charges)})`,
        ),
      ],
    };
  }

  const next = produce(addTrace(state, 2), s => {
    s.player.charges -= svc.exploitCost;
    const n = s.network.nodes[node.id];
    if (n) {
      n.accessLevel = svc.accessGained;
      n.compromised = true;
    }
  });

  return {
    lines: [
      out(`Exploiting ${service} on ${node.ip}...`),
      sys(`  Vulnerability confirmed.`),
      sys(`  Access gained: ${svc.accessGained.toUpperCase()}`),
      sys(`  Charges remaining: ${String(next.player.charges)}`),
    ],
    nextState: next,
  };
};

// ── exfil ─────────────────────────────────────────────────
const cmdExfil = (args: string[], state: GameState): CommandOutput => {
  if (!args[0]) return { lines: [err('Usage: exfil [filepath]')] };

  const node = currentNode(state);
  if (node.accessLevel === 'none') return { lines: [err('Not authenticated')] };

  const file = node.files.find(
    f => f.name === args[0] || f.path === args[0] || f.path.endsWith(`/${args[0]}`),
  );
  if (!file) return { lines: [err(`File not found: ${args[0]}`)] };
  if (!file.exfiltrable) return { lines: [err(`${file.name}: exfiltration blocked`)] };
  if (!hasAccess(node.accessLevel, file.accessRequired)) {
    return { lines: [err(`Permission denied: ${file.name}`)] };
  }

  const already = state.player.exfiltrated.some(f => f.path === file.path);
  if (already) return { lines: [sys(`Already exfiltrated: ${file.name}`)] };

  const next = produce(addTrace(state, 3), s => {
    s.player.exfiltrated.push({ ...file });
  });

  return {
    lines: [out(`Exfiltrating ${file.name}... done.`), sys(`  +3 trace`)],
    nextState: next,
  };
};

// ── wipe-logs ─────────────────────────────────────────────
const cmdWipeLogs = (state: GameState): CommandOutput => {
  const hasTool = state.player.tools.some(t => t.id === 'log-wiper');
  if (!hasTool) return { lines: [err('log-wiper tool required')] };

  const reduction = 15;
  const next = produce(state, s => {
    s.player.trace = Math.max(0, s.player.trace - reduction);
  });

  return {
    lines: [
      out('Wiping logs...'),
      sys(`  Trace reduced by ${String(reduction)}%. Now: ${String(next.player.trace)}%`),
    ],
    nextState: next,
  };
};
