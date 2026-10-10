import { hasAccess } from '../types/game';
import type { GameState, LiveNode } from '../types/game';
import { connectBlockedMessage, exploitChargeCost, scanTraceRange } from './commands';
import { currentNode } from './state';

// What a click on a node of the network map may do. The map only renders this list; each entry's
// `command` is the exact line a keyboard player would type, run through the normal command path.
export interface NodeAction {
  id: string; // unique within one node's menu
  kind:
    | 'connect'
    | 'scan-host'
    | 'scan-subnet'
    | 'login'
    | 'exploit'
    | 'disconnect'
    | 'wipe-logs'
    | 'spoof';
  label: string;
  command: string; // '' for an informational entry that cannot be run
  cost: string | null; // shown before the click; null when the action is free
  confirm: boolean; // true exactly when the action costs something
  disabledReason: string | null; // null when it can be run
}

const free = (
  id: string,
  kind: NodeAction['kind'],
  label: string,
  command: string,
  disabledReason: string | null = null,
): NodeAction => ({ id, kind, label, command, cost: null, confirm: false, disabledReason });

const costly = (
  id: string,
  kind: NodeAction['kind'],
  label: string,
  command: string,
  cost: string,
  disabledReason: string | null = null,
): NodeAction => ({ id, kind, label, command, cost, confirm: true, disabledReason });

const scanCost = (state: GameState): string => {
  const { min, max } = scanTraceRange(state);
  return max === 0 ? '+0 trace (port scanner)' : `+${String(min)}–${String(max)} trace`;
};

const charges = (n: number): string => `${String(n)} charge${n === 1 ? '' : 's'}`;

const exploitActions = (state: GameState, node: LiveNode): NodeAction[] => {
  // Only what a scan has shown the player: listing services of an unscanned host would leak which
  // ones are vulnerable. A node the player has compromised is known.
  const known = state.scanned.includes(node.id) || node.compromised;
  if (!known) {
    return [
      {
        id: 'exploit-hint',
        kind: 'exploit',
        label: 'Exploit',
        command: '',
        cost: null,
        confirm: false,
        disabledReason: 'Scan this host to find services',
      },
    ];
  }
  const hasKit = state.player.tools.some(t => t.id === 'exploit-kit');
  return node.services
    .filter(svc => svc.vulnerable && !svc.patched && !hasAccess(node.accessLevel, svc.accessGained))
    .map(svc => {
      const price = exploitChargeCost(node, svc);
      let reason: string | null = null;
      if (!hasKit) reason = 'exploit-kit tool required';
      else if (state.player.charges < price) {
        reason = `Insufficient charges (need ${String(price)}, have ${String(state.player.charges)})`;
      }
      const trace = svc.traceContribution ?? 2;
      return costly(
        `exploit:${svc.name}`,
        'exploit',
        `Exploit ${svc.name}`,
        `exploit ${svc.name}`,
        `${charges(price)}, +${String(trace)}–${String(trace + 5)} trace`,
        reason,
      );
    });
};

const loginActions = (state: GameState, node: LiveNode): NodeAction[] =>
  state.player.credentials
    .filter(c => c.obtained && !c.revoked && !hasAccess(node.accessLevel, c.accessLevel))
    .map(c =>
      costly(
        `login:${c.id}`,
        'login',
        `Login as ${c.username}`,
        `login ${c.username} ${c.password}`,
        '+5 trace if it does not work here',
      ),
    );

const currentNodeActions = (state: GameState, node: LiveNode): NodeAction[] => {
  const scan = scanCost(state);
  const actions: NodeAction[] = [
    costly('scan-host', 'scan-host', 'Scan host', `scan ${node.ip}`, scan),
    costly('scan-subnet', 'scan-subnet', 'Scan subnet', 'scan', scan),
    ...loginActions(state, node),
    ...exploitActions(state, node),
  ];

  const previous = state.network.previousNodeId
    ? state.network.nodes[state.network.previousNodeId]
    : undefined;
  if (previous) {
    actions.push(free('disconnect', 'disconnect', `Back to ${previous.label}`, 'disconnect'));
  }

  const unused = (id: 'log-wiper' | 'spoof-id') =>
    state.player.tools.some(t => t.id === id && !t.used);
  if (unused('log-wiper')) {
    actions.push(
      costly('wipe-logs', 'wipe-logs', 'Wipe logs', 'wipe-logs', '−15 trace, uses the log wiper'),
    );
  }
  if (unused('spoof-id')) {
    actions.push(costly('spoof', 'spoof', 'Spoof ID', 'spoof', '−20 trace, uses the spoof tool'));
  }
  return actions;
};

const otherNodeActions = (state: GameState, node: LiveNode): NodeAction[] => [
  free(
    `connect:${node.id}`,
    'connect',
    'Connect',
    `connect ${node.ip}`,
    connectBlockedMessage(state, node),
  ),
  costly(`scan:${node.id}`, 'scan-host', 'Scan', `scan ${node.ip}`, scanCost(state)),
];

export const nodeActions = (state: GameState, nodeId: string): NodeAction[] => {
  // The engine rejects all input at the decision terminal except 1 to 4, and none once the run
  // is over, so there is nothing to offer. The `aria` phase (after the subnet key is taken) is
  // still ordinary play.
  if (state.phase !== 'playing' && state.phase !== 'aria') return [];
  const here = currentNode(state);
  if (here.id === 'aria_decision') return [];
  const node = state.network.nodes[nodeId];
  if (!node?.discovered) return [];
  return node.id === here.id ? currentNodeActions(state, node) : otherNodeActions(state, node);
};
