import type { ChannelTrigger, GameState } from '../types/game';

type History = GameState['sentinel']['messageHistory'];

export const SENTINEL_HISTORY_LIMIT = 40;
export const SENTINEL_FALLBACK_REPLY = '...transmission interrupted.';
export const SENTINEL_FALLBACK_OPENING = '...I see you.';

const callSentinel = async (body: object, fallback: string): Promise<string> => {
  try {
    const res = await fetch('/api/sentinel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { reply?: unknown };
    return typeof data.reply === 'string' ? data.reply : fallback;
  } catch {
    return fallback;
  }
};

export const requestSentinelReply = (state: GameState, message: string): Promise<string> =>
  callSentinel(
    {
      message,
      sentinelContext: {
        traceLevel: state.player.trace,
        currentNodeId: state.network.currentNodeId,
        currentLayer: state.network.nodes[state.network.currentNodeId]?.layer ?? 0,
        recentCommands: state.recentCommands,
      },
      messageHistory: state.sentinel.messageHistory,
    },
    SENTINEL_FALLBACK_REPLY,
  );

export const requestSentinelOpening = (
  trigger: ChannelTrigger,
  state: GameState,
): Promise<string> =>
  callSentinel(
    {
      message: `[SYSTEM: trigger=${trigger.triggerType}]`,
      triggerContext: { type: trigger.triggerType },
      sentinelContext: trigger.context,
      messageHistory: state.sentinel.messageHistory,
    },
    SENTINEL_FALLBACK_OPENING,
  );

export const appendSentinelHistory = (state: GameState, entries: History): GameState => ({
  ...state,
  sentinel: {
    ...state.sentinel,
    messageHistory: [...state.sentinel.messageHistory, ...entries].slice(-SENTINEL_HISTORY_LIMIT),
  },
});

export const openSentinelChannel = (state: GameState): GameState => ({
  ...state,
  activeChannel: 'sentinel',
  sentinel: { ...state.sentinel, channelEstablished: true },
});

export const closeSentinelChannel = (state: GameState): GameState => ({
  ...state,
  activeChannel: null,
});

// A new run (new game, burn retry, resume choice) can land while a Sentinel request is
// still in flight. Callers take a token before awaiting and drop the result if it is no
// longer current, so a stale reply never leaks into the next run.
export interface RunGuard {
  token: () => number;
  invalidate: () => void;
  isCurrent: (token: number) => boolean;
}

export const createRunGuard = (): RunGuard => {
  let epoch = 0;
  return {
    token: () => epoch,
    invalidate: () => {
      epoch += 1;
    },
    isCurrent: token => token === epoch,
  };
};
