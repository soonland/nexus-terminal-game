import type { AriaState, GameState } from '../types/game';
import type { TerminalLine } from '../types/terminal';
import { isAriaNameKnown } from './ariaName';

// The conversation keeps only the last 50 entries (about 25 exchanges) to bound the save.
const ARIA_HISTORY_CAP = 50;

// The COMMS tab label follows the naming rule: the cover name until the player learns hers.
export const ariaTabLabel = (state: GameState): 'ARIA' | 'CASSANDRA' =>
  isAriaNameKnown(state) ? 'ARIA' : 'CASSANDRA';

// Exchanges (a player line and her reply) that have ever happened. The history is trimmed, so
// count them separately; an older save has no counter and falls back to what its history holds.
const exchangeTotal = (aria: AriaState): number =>
  aria.exchangeCount ?? aria.messageHistory.filter(m => m.role === 'aria').length;

// How many replies she has given in all (drives the unread marker; keeps growing past the cap).
export const ariaReplyCount = (state: GameState): number => exchangeTotal(state.aria);

// Adds one exchange to the conversation, bumps the counter and trims to the cap. Use this for
// every write to `aria.messageHistory`, so the counter and the history never drift apart.
export const appendAriaExchange = (
  aria: AriaState,
  playerText: string,
  reply: string,
): AriaState => ({
  ...aria,
  messageHistory: [
    ...aria.messageHistory,
    { role: 'player' as const, content: playerText },
    { role: 'aria' as const, content: reply },
  ].slice(-ARIA_HISTORY_CAP),
  exchangeCount: exchangeTotal(aria) + 1,
});

// The ARIA tab is derived from the saved conversation, so a reload rebuilds it exactly. A line's
// id comes from its exchange number (not its position), so it stays the same when older entries
// are trimmed and React never remounts or mis-keys it. The internal "DECISION: …" message the
// ending sends is not part of the conversation.
export const ariaChannelLines = (state: GameState): TerminalLine[] => {
  const history = state.aria.messageHistory;
  const firstExchange = exchangeTotal(state.aria) - Math.ceil(history.length / 2);
  return history.flatMap((message, index): TerminalLine[] => {
    const id = `aria-${String(firstExchange + Math.floor(index / 2))}-${message.role}`;
    if (message.role === 'player') {
      if (message.content.startsWith('DECISION:')) return [];
      return [
        {
          id,
          type: 'output',
          content: `${state.player.handle} >> ${message.content}`,
          timestamp: 0,
        },
      ];
    }
    return [{ id, type: 'aria', content: message.content, timestamp: 0 }];
  });
};
