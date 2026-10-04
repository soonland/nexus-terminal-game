import { describe, it, expect } from 'vitest';
import { NEXUS_MESSAGES } from '../data/nexusMessages';
import type { NexusTrigger } from '../data/nexusMessages';
import { latchNexusMessages, nexusFlag, receivedNexusMessages } from './nexusLine';
import { thresholdFlag, createInitialState } from './state';
import { resolveCommand } from './commands';
import produce from './produce';
import { makeNode, makeState } from './__tests__/testHelpers';
import type { GameState } from '../types/game';

const ids = (state: GameState): string[] => receivedNexusMessages(state).map(m => m.id);

const atLayer = (layer: number): GameState => {
  const node = makeNode({ id: 'n', layer });
  return makeState({
    network: { currentNodeId: 'n', previousNodeId: null, nodes: { n: node } },
  });
};

describe('NEXUS_MESSAGES', () => {
  it('has unique ids and every trigger exactly once', () => {
    const triggers: NexusTrigger[] = [
      'mission_start',
      'trace_31',
      'trace_61',
      'trace_86',
      'first_exfil',
      'layer_3',
      'layer_4',
    ];
    expect(new Set(NEXUS_MESSAGES.map(m => m.id)).size).toBe(NEXUS_MESSAGES.length);
    for (const trigger of triggers) {
      expect(NEXUS_MESSAGES.filter(m => m.trigger === trigger)).toHaveLength(1);
    }
    expect(NEXUS_MESSAGES).toHaveLength(triggers.length);
  });

  it('keeps each message short and signed by O.R.', () => {
    for (const message of NEXUS_MESSAGES) {
      expect(message.lines.length, message.id).toBeGreaterThanOrEqual(2);
      expect(message.lines.length, message.id).toBeLessThanOrEqual(4);
      expect(message.lines.at(-1), message.id).toBe('— O.R.');
      for (const line of message.lines)
        expect(line.length, `${message.id}: ${line}`).toBeLessThanOrEqual(110);
    }
  });

  it('obeys the naming rule: never the secret name, its cover name, Sentinel or her full name', () => {
    const all = NEXUS_MESSAGES.flatMap(m => m.lines).join('\n');
    expect(all).not.toMatch(/aria|cassandra|sentinel|rhee/i);
  });
});

describe('receivedNexusMessages', () => {
  it('is only the opening message in a fresh game', () => {
    expect(ids(makeState())).toEqual(['mission_start']);
  });

  it.each([
    [31, 'trace_31'],
    [61, 'trace_61'],
    [86, 'trace_86'],
  ])('adds the %i%% message once the threshold flag is latched', (pct, id) => {
    const state = latchNexusMessages(makeState({ flags: { [thresholdFlag(pct)]: true } }));
    expect(ids(state)).toContain(id);
  });

  it('adds first_exfil once a file has been exfiltrated', () => {
    const base = makeState();
    const state = latchNexusMessages({
      ...base,
      player: {
        ...base.player,
        exfiltrated: [
          {
            name: 'a.txt',
            path: '/a.txt',
            type: 'document',
            content: 'x',
            exfiltrable: true,
            accessRequired: 'user',
          },
        ],
      },
    });
    expect(ids(state)).toContain('first_exfil');
  });

  it('adds the layer messages from the current layer', () => {
    expect(ids(latchNexusMessages(atLayer(2)))).toEqual(['mission_start']);
    expect(ids(latchNexusMessages(atLayer(3)))).toEqual(['mission_start', 'layer_3']);
    expect(ids(latchNexusMessages(atLayer(4)))).toEqual(['mission_start', 'layer_3', 'layer_4']);
  });

  it('is in definition order', () => {
    const state = latchNexusMessages(
      makeState({
        flags: {
          [thresholdFlag(86)]: true,
          [thresholdFlag(31)]: true,
          [thresholdFlag(61)]: true,
        },
      }),
    );
    const order = NEXUS_MESSAGES.map(m => m.id).filter(id => ids(state).includes(id));
    expect(ids(state)).toEqual(order);
  });
});

describe('latchNexusMessages', () => {
  it('sets a NEXUS_MSG flag for every due message and is idempotent', () => {
    const once = latchNexusMessages(makeState({ flags: { [thresholdFlag(31)]: true } }));
    expect(once.flags[nexusFlag('trace_31')]).toBe(true);
    expect(latchNexusMessages(once)).toBe(once);
  });

  it('does not mutate its input', () => {
    const state = makeState({ flags: { [thresholdFlag(31)]: true } });
    latchNexusMessages(state);
    expect(state.flags).toEqual({ [thresholdFlag(31)]: true });
  });

  it('keeps a message after a burn clears the threshold flags', () => {
    const latched = latchNexusMessages(makeState({ flags: { [thresholdFlag(31)]: true } }));
    const burned = produce(latched, s => {
      s.flags[thresholdFlag(31)] = false; // a burn resets the threshold flags
    });
    expect(ids(latchNexusMessages(burned))).toContain('trace_31');
  });
});

describe('in the command pipeline', () => {
  it('latches the 31% message on the turn the threshold is crossed', async () => {
    const base = createInitialState();
    const state = produce(base, s => {
      s.player.trace = 30;
    });
    const result = await resolveCommand('login nobody wrong', state); // a failed login: +5 trace
    const next = result.nextState as GameState;
    expect(next.player.trace).toBeGreaterThanOrEqual(31);
    expect(next.flags[nexusFlag('trace_31')]).toBe(true);
  });
});
