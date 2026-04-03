import type { GameState, LiveNode, MutationEvent, SentinelAction } from '../types/game';
import type { LineType } from '../types/terminal';
import produce from './produce';

type SentinelLine = { type: LineType; content: string };

const sentinelLine = (content: string): SentinelLine => ({ type: 'system', content });
const sentinelErr = (content: string): SentinelLine => ({ type: 'error', content });

const makeMutationEvent = (
  action: SentinelAction,
  turnCount: number,
  extras: Omit<MutationEvent, 'id' | 'agent' | 'action' | 'turnCount'> = {},
): MutationEvent => ({
  id: crypto.randomUUID(),
  agent: 'sentinel',
  action,
  turnCount,
  ...extras,
});

/**
 * Generate a deterministic-looking but unique sentinel node IP.
 * Uses the count of existing sentinel-spawned nodes to pick an address.
 */
const spawnedNodeCount = (state: GameState): number =>
  state.sentinel.mutationLog.filter(e => e.action === 'spawn_node').length;

const generateSentinelIp = (state: GameState): string => {
  const n = spawnedNodeCount(state);
  return `10.9.${String(Math.floor(n / 254))}.${String((n % 254) + 1)}`;
};

// ── Priority 1: patch most recently compromised non-aria node ──────────────

const tryPatchNode = (state: GameState): { state: GameState; lines: SentinelLine[] } | null => {
  const candidates = Object.values(state.network.nodes).filter(
    (n): n is LiveNode => !!n && n.compromised && n.layer !== 5 && !n.sentinelPatched,
  );
  if (candidates.length === 0) return null;

  // Pick most recently compromised (highest compromisedAtTurn), tie-break by id ascending
  const target = candidates.reduce((best, n) => {
    const bestTurn = best.compromisedAtTurn ?? 0;
    const nTurn = n.compromisedAtTurn ?? 0;
    if (nTurn > bestTurn) return n;
    if (nTurn < bestTurn) return best;
    return n.id < best.id ? n : best;
  });

  const event = makeMutationEvent('patch_node', state.turnCount, { nodeId: target.id });
  const next = produce(state, s => {
    const node = s.network.nodes[target.id];
    if (node) node.sentinelPatched = true;
    s.sentinel.mutationLog.push(event);
  });

  return {
    state: next,
    lines: [
      sentinelLine(''),
      sentinelErr(`// SENTINEL: Node ${target.ip} (${target.label}) hardened.`),
      sentinelLine(`//           Exploit cost on this node increased by 1 charge.`),
      sentinelLine(''),
    ],
  };
};

// ── Priority 2: revoke credential of breached employee ────────────────────

const REVOKED_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generatePassword = (seed: number): string => {
  let n = seed;
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += REVOKED_PASSWORD_CHARS[n % REVOKED_PASSWORD_CHARS.length];
    n = Math.floor(n / REVOKED_PASSWORD_CHARS.length) + (n % 7) * 31 + 17;
  }
  return result.slice(0, 4) + '-' + result.slice(4);
};

const tryRevokeCredential = (
  state: GameState,
): { state: GameState; lines: SentinelLine[] } | null => {
  const target = state.player.credentials.find(c => c.obtained && !c.revoked);
  if (!target) return null;

  const primaryNodeId = target.validOnNodes[0];
  const newPassword = generatePassword(Date.now() % 1_000_000);
  // Strip any existing _rN suffix before appending a new turn-stamped one
  const baseId = target.id.replace(/_r\d+$/, '');
  const newCredId = `${baseId}_r${String(state.turnCount)}`;

  const event = makeMutationEvent('revoke_credential', state.turnCount, {
    credentialId: target.id,
    nodeId: primaryNodeId,
  });

  const next = produce(state, s => {
    // Revoke existing credential in player inventory
    const idx = s.player.credentials.findIndex(c => c.id === target.id);
    if (idx !== -1) s.player.credentials[idx].revoked = true;

    // Add renewed credential to world (player must find it)
    s.worldCredentials.push({
      id: newCredId,
      username: target.username,
      password: newPassword,
      accessLevel: target.accessLevel,
      validOnNodes: target.validOnNodes,
      obtained: false,
      source: primaryNodeId ? `${primaryNodeId}/workstation` : undefined,
    });

    // Plant a file on the primary node so the player can find the new password.
    // Use a turn-stamped path to avoid duplicate entries if multiple revocations occur.
    if (primaryNodeId) {
      const node = s.network.nodes[primaryNodeId];
      if (node && !node.files.some(f => f.name === 'RESET_NOTICE.txt')) {
        node.files.push({
          name: 'RESET_NOTICE.txt',
          path: '/home/admin/RESET_NOTICE.txt',
          type: 'document',
          content: `SECURITY NOTICE — CREDENTIAL RESET\n\nYour account credentials have been automatically rotated by IronGate\nsecurity policy. Your new temporary password is listed below.\n\n  Username : ${target.username}\n  Password : ${newPassword}\n\nChange your password immediately upon next login.\n\n-- IronGate IT Security`,
          exfiltrable: false,
          accessRequired: 'user',
          planted: true,
        });
      }
    }

    s.sentinel.mutationLog.push(event);
  });

  return {
    state: next,
    lines: [
      sentinelLine(''),
      sentinelErr(`// SENTINEL: Credential '${target.username}' revoked.`),
      sentinelLine(`//           New password filed on workstation at ${primaryNodeId}.`),
      sentinelLine(''),
    ],
  };
};

// ── Priority 3: delete exfiltrated file source after 3-turn delay ─────────

const tryDeleteFile = (state: GameState): { state: GameState; lines: SentinelLine[] } | null => {
  const duePending = state.sentinel.pendingFileDeletes.filter(p => p.targetTurn <= state.turnCount);
  if (duePending.length === 0) return null;

  // Silently discard entries targeting Aria (layer 5) nodes
  const ariaEntries = duePending.filter(p => state.network.nodes[p.nodeId]?.layer === 5);
  const pending = duePending.find(p => state.network.nodes[p.nodeId]?.layer !== 5);

  if (!pending && ariaEntries.length === 0) return null;

  const next = produce(state, s => {
    // Clear Aria entries without acting on them
    for (const aria of ariaEntries) {
      s.sentinel.pendingFileDeletes = s.sentinel.pendingFileDeletes.filter(
        p => p.filePath !== aria.filePath || p.nodeId !== aria.nodeId,
      );
    }

    if (!pending) return;

    const node = s.network.nodes[pending.nodeId];
    if (node) {
      const file = node.files.find(f => f.path === pending.filePath);
      if (file) file.deleted = true;
    }
    s.sentinel.pendingFileDeletes = s.sentinel.pendingFileDeletes.filter(
      p => p.filePath !== pending.filePath || p.nodeId !== pending.nodeId,
    );
    s.sentinel.mutationLog.push(
      makeMutationEvent('delete_file', state.turnCount, {
        nodeId: pending.nodeId,
        filePath: pending.filePath,
      }),
    );
  });

  if (!pending) return { state: next, lines: [] };

  const fileName = pending.filePath.split('/').pop() ?? pending.filePath;
  return {
    state: next,
    lines: [
      sentinelLine(''),
      sentinelErr(`// SENTINEL: Source file '${fileName}' deleted from ${pending.nodeId}.`),
      sentinelLine(`//           Exfiltrated copy retained; origin evidence destroyed.`),
      sentinelLine(''),
    ],
  };
};

// ── Priority 4: spawn reinforcement security node ─────────────────────────

const trySpawnNode = (state: GameState): { state: GameState; lines: SentinelLine[] } => {
  const ip = generateSentinelIp(state);
  const nodeId = `sentinel_node_${String(spawnedNodeCount(state) + 1)}`;

  // Connect to existing security-layer nodes
  const securityNodes = Object.values(state.network.nodes)
    .filter((n): n is LiveNode => !!n && n.layer === 2)
    .map(n => n.id)
    .slice(0, 2);

  const event = makeMutationEvent('spawn_node', state.turnCount, { nodeId });

  const next = produce(state, s => {
    s.network.nodes[nodeId] = {
      id: nodeId,
      ip,
      template: 'security_node',
      label: 'SEC-REINFORCE',
      description: 'IronGate emergency security reinforcement node.',
      layer: 2,
      anchor: false,
      connections: securityNodes,
      services: [
        {
          name: 'ssh',
          port: 22,
          vulnerable: false,
          exploitCost: 3,
          accessGained: 'user',
          traceContribution: 4,
        },
      ],
      files: [],
      accessLevel: 'none',
      compromised: false,
      discovered: true,
      sentinelPatched: true,
      credentialHints: [],
    };

    // Wire connections back from existing security nodes
    for (const secId of securityNodes) {
      const secNode = s.network.nodes[secId];
      if (secNode && !secNode.connections.includes(nodeId)) {
        secNode.connections.push(nodeId);
      }
    }

    s.sentinel.mutationLog.push(event);
  });

  return {
    state: next,
    lines: [
      sentinelLine(''),
      sentinelErr(`// SENTINEL: Reinforcement node deployed at ${ip}.`),
      sentinelLine(`//           New security node visible in subnet scans.`),
      sentinelLine(''),
    ],
  };
};

// ── Main entry point ──────────────────────────────────────────────────────

export const runSentinelTurn = (state: GameState): { state: GameState; lines: SentinelLine[] } => {
  // Sentinel activates when trace first crosses 61 and stays active even if trace drops.
  const shouldAct = state.sentinel.active || state.player.trace >= 61;
  if (!shouldAct) return { state, lines: [] };

  // Flip active flag on first eligible turn
  let current = state;
  if (!current.sentinel.active) {
    current = produce(current, s => {
      s.sentinel.active = true;
    });
  }

  // Evaluate priority queue — one action per turn
  return (
    tryPatchNode(current) ??
    tryRevokeCredential(current) ??
    tryDeleteFile(current) ??
    trySpawnNode(current)
  );
};
