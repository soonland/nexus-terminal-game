import type { GameState, MutationEvent } from '../types/game';
import type { LineType } from '../types/terminal';

export type ReadoutLine = { type: LineType; content: string };

const formatSentinelEvent = (event: MutationEvent): string => {
  const turn = String(event.turnCount).padStart(3, '0');
  const prefix = `  T${turn} SENTINEL:`;
  switch (event.action) {
    case 'patch_node':
      return `${prefix} Node '${event.nodeId ?? '?'}' hardened (+1 exploit charge)`;
    case 'revoke_credential':
      return `${prefix} Credential '${event.credentialId ?? '?'}' revoked on '${event.nodeId ?? '?'}'`;
    case 'delete_file': {
      const fileName = (event.filePath ?? '?').split('/').pop() ?? '?';
      return `${prefix} File '${fileName}' deleted from '${event.nodeId ?? '?'}'`;
    }
    case 'spawn_node':
      return `${prefix} Reinforcement node '${event.nodeId ?? '?'}' deployed`;
  }
};

const getEndingName = (flags: Record<string, boolean>): string => {
  const key = Object.keys(flags).find(k => k.startsWith('ending_'));
  if (!key) return 'UNKNOWN';
  return key.replace('ending_', '').toUpperCase();
};

/**
 * Build the post-game readout lines from a completed GameState.
 * Returns a flat array of { type, content } pairs suitable for rendering in the terminal.
 *
 * Exported as a pure function so it can be tested independently of React.
 */
export const buildPostGameReadout = (state: GameState): ReadoutLine[] => {
  const compromised = Object.values(state.network.nodes).filter(n => n?.compromised).length;
  // All current events are sentinel-generated; the filter will matter once Aria mutations are added (sub-issue C)
  const sentinelEvents = state.sentinel.mutationLog;
  const endingName = getEndingName(state.flags);

  const lines: ReadoutLine[] = [
    { type: 'separator', content: '' },
    { type: 'aria', content: '// POST-GAME READOUT' },
    { type: 'separator', content: '' },
    { type: 'system', content: `  ENDING:              ${endingName}` },
    { type: 'system', content: `  RUN DURATION:        ${String(state.turnCount)} turns` },
    { type: 'system', content: `  TRACE AT END:        ${String(state.player.trace)}%` },
    { type: 'system', content: `  NODES COMPROMISED:   ${String(compromised)}` },
    {
      type: 'system',
      content: `  FILES EXFILTRATED:   ${String(state.player.exfiltrated.length)}`,
    },
    { type: 'system', content: `  ARIA TRUST:          ${String(state.aria.trustScore)}` },
    { type: 'system', content: `  SENTINEL ACTIONS:    ${String(sentinelEvents.length)}` },
  ];

  if (sentinelEvents.length > 0) {
    lines.push({ type: 'separator', content: '' });
    lines.push({ type: 'error', content: '// SENTINEL ACTIVITY LOG' });
    for (const event of sentinelEvents) {
      lines.push({ type: 'error', content: formatSentinelEvent(event) });
    }
  }

  lines.push({ type: 'separator', content: '' });
  lines.push({ type: 'system', content: '[ENTER] New game' });
  lines.push({ type: 'separator', content: '' });

  return lines;
};
