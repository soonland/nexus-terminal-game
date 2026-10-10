import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import { nodeActions } from '../mapActions';
import { createInitialState } from '../state';
import produce from '../produce';
import type { Credential, GameState, LiveNode, Tool } from '../../types/game';

// The menu is only a front end for commands, so an entry it enables must not be refused for a
// precondition the menu should have checked. Failures of the game itself (a wrong exploit, say)
// are fine; these messages are not.
const PRECONDITION =
  /^(Usage:|Host not found|No route|No direct route|Already connected|Service not found|Insufficient charges|exploit-kit tool required|spoof-id tool required|log-wiper tool required|No previous node)|tool depleted|ACCESS DENIED|Authentication failed|CREDENTIAL REVOKED|no known vulnerability|patched — exploit unavailable/;

const node = (s: GameState, id: string): LiveNode => {
  const n = s.network.nodes[id];
  if (!n) throw new Error(`no node ${id}`);
  return n;
};
const tool = (id: Tool['id']): Tool => ({ id, name: id, description: id, used: false });
const cred = (over: Partial<Credential>): Credential => ({
  id: 'cred_t',
  username: 'ops.admin',
  password: 'Hunter2!',
  accessLevel: 'admin',
  validOnNodes: ['contractor_portal'],
  obtained: true,
  ...over,
});

const samples = (): Record<string, GameState> => ({
  'a fresh run': createInitialState(),
  'scanned and equipped': produce(createInitialState(), s => {
    s.scanned = ['contractor_portal'];
    s.player.credentials = [cred({})];
    s.player.tools = [...s.player.tools, tool('log-wiper'), tool('spoof-id')];
    node(s, 'vpn_gateway').discovered = true;
    node(s, 'ops_hr_db').discovered = true;
  }),
  'on the key anchor with a layer to cross': produce(createInitialState(), s => {
    s.network.currentNodeId = 'vpn_gateway';
    s.network.previousNodeId = 'contractor_portal';
    node(s, 'vpn_gateway').discovered = true;
    node(s, 'vpn_gateway').accessLevel = 'user';
    node(s, 'ops_cctv_ctrl').discovered = true;
    node(s, 'ops_hr_db').discovered = true;
  }),
  'with the key anchor compromised': produce(createInitialState(), s => {
    s.network.currentNodeId = 'vpn_gateway';
    s.network.previousNodeId = 'contractor_portal';
    node(s, 'vpn_gateway').discovered = true;
    node(s, 'vpn_gateway').compromised = true;
    node(s, 'vpn_gateway').accessLevel = 'admin';
    node(s, 'ops_cctv_ctrl').discovered = true;
    node(s, 'ops_hr_db').discovered = true;
  }),
  'out of charges': produce(createInitialState(), s => {
    s.scanned = ['contractor_portal'];
    s.player.charges = 0;
  }),
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          narrative: 'The AI responded.',
          traceChange: 0,
          accessGranted: false,
          newAccessLevel: null,
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
          suggestions: [],
        }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nodeActions contract: an enabled entry is never refused for a precondition', () => {
  for (const [name, state] of Object.entries(samples())) {
    it(name, async () => {
      let checked = 0;
      for (const id of Object.keys(state.network.nodes)) {
        for (const action of nodeActions(state, id)) {
          if (action.disabledReason !== null || action.command === '') continue;
          const result = await resolveCommand(action.command, state);
          const refused = result.lines
            .filter(l => l.type === 'error')
            .map(l => l.content)
            .filter(text => PRECONDITION.test(text));
          expect(refused, `${id}: ${action.command}`).toEqual([]);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  }

  it('and a disabled Connect really is refused by the command, with the same message', async () => {
    const state = samples()['scanned and equipped'];
    const [connect] = nodeActions(state, 'ops_hr_db');
    expect(connect.disabledReason).not.toBeNull();
    const result = await resolveCommand('connect 10.1.0.2', state);
    expect(result.lines.map(l => l.content)).toContain(connect.disabledReason);
  });
});
