import type { GameState } from '../types/game';
import type { TerminalLine } from '../types/terminal';
import { isAriaNameKnown } from './ariaName';

// The COMMS tab label follows the naming rule: the cover name until the player learns hers.
export const ariaTabLabel = (state: GameState): 'ARIA' | 'CASSANDRA' =>
  isAriaNameKnown(state) ? 'ARIA' : 'CASSANDRA';

// How many replies she has given (drives the unread marker).
export const ariaReplyCount = (state: GameState): number =>
  state.aria.messageHistory.filter(m => m.role === 'aria').length;

// The ARIA tab is derived from the saved conversation, so a reload rebuilds it exactly. Ids are
// stable (position-based) so React does not remount lines. The internal "DECISION: …" message the
// ending sends is not part of the conversation.
export const ariaChannelLines = (state: GameState): TerminalLine[] =>
  state.aria.messageHistory.flatMap((message, index): TerminalLine[] => {
    if (message.role === 'player') {
      if (message.content.startsWith('DECISION:')) return [];
      return [
        {
          id: `aria-${String(index)}`,
          type: 'output',
          content: `${state.player.handle} >> ${message.content}`,
          timestamp: 0,
        },
      ];
    }
    return [{ id: `aria-${String(index)}`, type: 'aria', content: message.content, timestamp: 0 }];
  });
