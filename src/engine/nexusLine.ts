import { NEXUS_MESSAGES } from '../data/nexusMessages';
import type { NexusMessage } from '../data/nexusMessages';
import type { GameState } from '../types/game';
import { thresholdFlag } from './state';

// "Already sent" lives in the existing flags map (persisted in saves, no version change).
export const nexusFlag = (id: string): string => `NEXUS_MSG_${id}`;

const currentLayer = (state: GameState): number =>
  state.network.nodes[state.network.currentNodeId]?.layer ?? 0;

const flagSet = (state: GameState, flag: string): boolean =>
  flag in state.flags && state.flags[flag];

const isDue = (message: NexusMessage, state: GameState): boolean => {
  switch (message.trigger) {
    case 'mission_start':
      return true;
    case 'trace_31':
      return flagSet(state, thresholdFlag(31));
    case 'trace_61':
      return flagSet(state, thresholdFlag(61));
    case 'trace_86':
      return flagSet(state, thresholdFlag(86));
    case 'first_exfil':
      return state.player.exfiltrated.length > 0;
    case 'layer_3':
      return currentLayer(state) >= 3;
    case 'layer_4':
      return currentLayer(state) >= 4;
  }
};

// What the NEXUS tab shows: the opening message, plus every message already latched. A burn
// clears the trace threshold flags, so a latched message stays; one that is merely due but not
// yet latched (the command pipeline has not run) is not shown.
export const receivedNexusMessages = (state: GameState): NexusMessage[] =>
  NEXUS_MESSAGES.filter(m => m.trigger === 'mission_start' || flagSet(state, nexusFlag(m.id)));

// Called once per turn: every message whose trigger now holds is latched so it is sent exactly once.
export const latchNexusMessages = (state: GameState): GameState => {
  const newlyDue = NEXUS_MESSAGES.filter(
    m => m.trigger !== 'mission_start' && !flagSet(state, nexusFlag(m.id)) && isDue(m, state),
  );
  if (newlyDue.length === 0) return state;
  const flags = { ...state.flags };
  for (const message of newlyDue) flags[nexusFlag(message.id)] = true;
  return { ...state, flags };
};
