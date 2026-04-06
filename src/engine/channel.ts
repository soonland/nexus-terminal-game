import type { GameState, ChannelTrigger, TriggerType } from '../types/game';
import { thresholdFlag } from './state';

/**
 * Build the context object sent with every channel trigger.
 * Extracted as a helper so trigger detection and the msg command share the same shape.
 */
const buildContext = (state: GameState): ChannelTrigger['context'] => {
  const node = state.network.nodes[state.network.currentNodeId];
  return {
    traceLevel: state.player.trace,
    currentNodeId: state.network.currentNodeId,
    currentLayer: node?.layer ?? 0,
    recentCommands: state.recentCommands,
  };
};

/** Flag key used to track first-arrival at a given network layer. */
export const layerReachedFlag = (layer: number): string => `layer_${String(layer)}_reached`;

const makeTrigger = (triggerType: TriggerType, state: GameState): ChannelTrigger => ({
  character: 'sentinel',
  triggerType,
  context: buildContext(state),
});

// ── Blocking ───────────────────────────────────────────────

/**
 * Returns true when the Sentinel channel cannot be opened.
 * Checked before every entry attempt (trigger-fired or manual).
 */
export const isChannelBlocked = (state: GameState): boolean => {
  if (state.phase === 'burned' || state.phase === 'ended') return true;
  return state.player.trace > 86;
};

// ── Trigger detection ──────────────────────────────────────

/**
 * Inspect the transition from prevState → nextState (after a command) and
 * return a ChannelTrigger if a Sentinel DM trigger condition fired.
 *
 * Only the first matching trigger per command is returned — triggers are
 * mutually exclusive within a single turn.
 *
 * @param command - the raw command string (used to detect high-value commands)
 */
export const detectChannelTrigger = (
  prevState: GameState,
  nextState: GameState,
  command: string,
): ChannelTrigger | null => {
  // Never trigger when the channel is blocked in the resulting state
  if (isChannelBlocked(nextState)) return null;

  const verb = command.trim().split(/\s+/)[0]?.toLowerCase() ?? '';

  // ── Trace threshold crossings (31 / 61 / 86) ─────────────
  const tracePcts = [31, 61, 86] as const;
  for (const pct of tracePcts) {
    const flag = thresholdFlag(pct);
    if (!prevState.flags[flag] && nextState.flags[flag]) {
      const triggerType: TriggerType =
        pct === 31 ? 'trace_31' : pct === 61 ? 'trace_61' : 'trace_86';
      return makeTrigger(triggerType, nextState);
    }
  }

  // ── Layer breach (first arrival at a new layer) ───────────
  const prevNode = prevState.network.nodes[prevState.network.currentNodeId];
  const nextNode = nextState.network.nodes[nextState.network.currentNodeId];
  if (nextNode && prevNode && nextNode.layer > prevNode.layer && nextNode.layer >= 1) {
    // Only fire the first time this layer is reached.
    // The caller (withTurn) stamps the flag after detecting this trigger.
    const layerFlag = layerReachedFlag(nextNode.layer);
    if (!prevState.flags[layerFlag] && !nextState.flags[layerFlag]) {
      return makeTrigger('layer_breach', nextState);
    }
  }

  // ── High-value commands ───────────────────────────────────
  // Only trigger once — skip if the channel was already established
  if (!nextState.sentinel.channelEstablished) {
    if (verb === 'exploit') return makeTrigger('exploit', nextState);
    if (verb === 'exfil') return makeTrigger('exfil', nextState);
    if (verb === 'wipe-logs') return makeTrigger('wipe_logs', nextState);
  }

  return null;
};
