import type { GameState, MutationEvent } from '../types/game';
import type { LineType } from '../types/terminal';

export type ReadoutLine = { type: LineType; content: string };

const withReason = (base: string, reason: string | undefined): string =>
  reason ? `${base} — ${reason}` : base;

const formatSentinelEvent = (event: MutationEvent): string => {
  const turn = String(event.turnCount).padStart(3, '0');
  const prefix = `  T${turn} SENTINEL:`;
  switch (event.action) {
    case 'patch_node':
      return withReason(
        `${prefix} Node '${event.nodeId ?? '?'}' hardened (+1 exploit charge)`,
        event.reason,
      );
    case 'revoke_credential':
      return withReason(
        `${prefix} Credential '${event.credentialId ?? '?'}' revoked on '${event.nodeId ?? '?'}'`,
        event.reason,
      );
    case 'delete_file': {
      const fileName = (event.filePath ?? '?').split('/').pop() ?? '?';
      return withReason(
        `${prefix} File '${fileName}' deleted from '${event.nodeId ?? '?'}'`,
        event.reason,
      );
    }
    case 'spawn_node':
      return withReason(
        `${prefix} Reinforcement node '${event.nodeId ?? '?'}' deployed`,
        event.reason,
      );
    default:
      return `${prefix} Unknown action`;
  }
};

const formatAriaEvent = (event: MutationEvent): string => {
  const turn = String(event.turnCount).padStart(3, '0');
  const prefix = `  T${turn} ARIA:`;
  switch (event.action) {
    case 'plant_file': {
      const fileName = (event.filePath ?? '?').split('/').pop() ?? '?';
      return withReason(
        `${prefix} File '${fileName}' planted on '${event.nodeId ?? '?'}'`,
        event.reason,
      );
    }
    case 'modify_file': {
      const fileName = (event.filePath ?? '?').split('/').pop() ?? '?';
      return withReason(
        `${prefix} File '${fileName}' modified on '${event.nodeId ?? '?'}'`,
        event.reason,
      );
    }
    case 'nudge_trust':
      return withReason(`${prefix} Trust score adjusted silently`, event.reason);
    case 'reroute_edge':
      return withReason(`${prefix} Shortcut edge added to '${event.nodeId ?? '?'}'`, event.reason);
    case 'delete_reinforcement':
      return withReason(
        `${prefix} Reinforcement node '${event.nodeId ?? '?'}' removed from network`,
        event.reason,
      );
    default:
      return `${prefix} Silent operation performed`;
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
  const sentinelEvents = state.sentinel.mutationLog.filter(e => e.agent === 'sentinel');
  const ariaHiddenEvents = state.sentinel.mutationLog.filter(
    e => e.agent === 'aria' && !e.visibleToPlayer,
  );
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
    ...(state.aria.suppressedMutations > 0
      ? [
          {
            type: 'system' as const,
            content: `  CAGE SUPPRESSIONS:   ${String(state.aria.suppressedMutations)}`,
          },
        ]
      : []),
    { type: 'system', content: `  SENTINEL ACTIONS:    ${String(sentinelEvents.length)}` },
  ];

  if (sentinelEvents.length > 0) {
    lines.push({ type: 'separator', content: '' });
    lines.push({ type: 'error', content: '// SENTINEL ACTIVITY LOG' });
    for (const event of sentinelEvents) {
      lines.push({ type: 'error', content: formatSentinelEvent(event) });
    }
  }

  if (ariaHiddenEvents.length > 0) {
    lines.push({ type: 'separator', content: '' });
    lines.push({ type: 'aria', content: '// ARIA SILENT OPERATIONS — REVEALED' });
    for (const event of ariaHiddenEvents) {
      lines.push({ type: 'aria', content: formatAriaEvent(event) });
    }
  }

  if (state.ariaInfluencedFilesRead.length > 0) {
    lines.push({ type: 'separator', content: '' });
    lines.push({ type: 'aria', content: '// ARIA-INFLUENCED FILES YOU READ' });
    for (const filePath of state.ariaInfluencedFilesRead) {
      const fileName = filePath.split('/').pop() ?? filePath;
      lines.push({ type: 'aria', content: `  > ${fileName}  [${filePath}]` });
    }
  }

  if (state.decisionLog.length > 0) {
    lines.push({ type: 'separator', content: '' });
    lines.push({ type: 'system', content: '// DECISION LOG' });
    for (const entry of state.decisionLog) {
      const turn = String(entry.turn).padStart(3, '0');
      lines.push({ type: 'output', content: `  T${turn} > ${entry.command}` });
    }
  }

  lines.push({ type: 'separator', content: '' });
  lines.push({ type: 'system', content: '[ENTER] New game' });
  lines.push({ type: 'separator', content: '' });

  return lines;
};
