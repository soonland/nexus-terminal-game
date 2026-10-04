import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from './commands';
import { saveGame, loadGame } from './persistence';
import { createInitialState } from './state';
import type { GameState } from '../types/game';

const store = new Map<string, string>();
const mockStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  },
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', mockStorage);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const run = async (
  state: GameState,
  command: string,
): Promise<{ state: GameState; text: string }> => {
  const result = await resolveCommand(command, state);
  return {
    state: (result.nextState ?? state) as GameState,
    text: result.lines.map(l => l.content).join(' | '),
  };
};

const reload = (state: GameState): GameState => {
  saveGame(state);
  const loaded = loadGame();
  if (!loaded) throw new Error('load failed');
  return loaded;
};

describe('going back after loading a save', () => {
  const walk = async (): Promise<GameState> => {
    let s = createInitialState();
    for (const c of [
      'login contractor Welcome1!',
      'scan',
      'connect 10.0.0.2',
      'login contractor Welcome1!',
      'scan',
      'connect 10.1.0.1',
    ]) {
      s = (await run(s, c)).state;
    }
    return s;
  };

  it('the live game can go back to the previous node', async () => {
    const live = await walk();
    expect(live.network.currentNodeId).toBe('ops_cctv_ctrl');
    const back = await run(live, 'connect 10.0.0.2');
    expect(back.state.network.currentNodeId, back.text).toBe('vpn_gateway');
  });

  it('a loaded game can connect back to the node it came from', async () => {
    const loaded = reload(await walk());
    expect(loaded.network.currentNodeId).toBe('ops_cctv_ctrl');
    const back = await run(loaded, 'connect 10.0.0.2');
    expect(back.state.network.currentNodeId, back.text).toBe('vpn_gateway');
  });

  it('a loaded game can disconnect to the previous node', async () => {
    const loaded = reload(await walk());
    const back = await run(loaded, 'disconnect');
    expect(back.state.network.currentNodeId, back.text).toBe('vpn_gateway');
  });

  it('a loaded game can go two hops back, to the entry node', async () => {
    const loaded = reload(await walk());
    const one = await run(loaded, 'connect 10.0.0.2');
    const two = await run(one.state, 'connect 10.0.0.1');
    expect(two.state.network.currentNodeId, two.text).toBe('contractor_portal');
  });
});

describe('routes added during play survive a save and load', () => {
  const rebuilt = (mutate: (s: GameState) => void): GameState => {
    const base = createInitialState();
    mutate(base);
    return reload(base);
  };

  it('the whistleblower route from the HR database', () => {
    const loaded = rebuilt(s => {
      s.flags['WHISTLEBLOWER_FOUND'] = true;
      const hr = s.network.nodes['ops_hr_db']!;
      hr.discovered = true; // the player has been there
      hr.connections = [...hr.connections, 'whistleblower_workstation'];
      s.network.nodes['whistleblower_workstation']!.discovered = true;
    });
    expect(loaded.network.nodes['ops_hr_db']!.connections).toContain('whistleblower_workstation');
  });

  it('a shortcut edge added by Aria', () => {
    const loaded = rebuilt(s => {
      const node = s.network.nodes['sec_firewall']!;
      node.connections = [...node.connections, 'exec_cfo'];
      node.discovered = true;
    });
    expect(loaded.network.nodes['sec_firewall']!.connections).toContain('exec_cfo');
  });

  it('the route to a Sentinel reinforcement node, even from a node never visited', () => {
    const loaded = rebuilt(s => {
      const sec = s.network.nodes['sec_access_ctrl']!; // not discovered: not saved as a node delta
      sec.connections = [...sec.connections, 'sentinel_node_1'];
      s.network.nodes['sentinel_node_1'] = {
        ...sec,
        id: 'sentinel_node_1',
        ip: '10.2.9.9',
        connections: ['sec_access_ctrl'],
        discovered: true,
        anchor: false,
      };
    });
    expect(loaded.network.nodes['sentinel_node_1']).toBeDefined();
    expect(loaded.network.nodes['sec_access_ctrl']!.connections).toContain('sentinel_node_1');
  });

  it('an old save without saved connections still loads with the static routes', () => {
    const base = createInitialState();
    base.network.nodes['ops_hr_db']!.discovered = true;
    saveGame(base);
    const raw = JSON.parse(store.get('irongate_save') ?? '{}') as {
      network: { nodes: Record<string, { connections?: string[] }> };
    };
    for (const delta of Object.values(raw.network.nodes)) delete delta.connections;
    store.set('irongate_save', JSON.stringify(raw));
    const loaded = loadGame();
    expect(loaded?.network.nodes['ops_hr_db']!.connections).toEqual(
      createInitialState(base.sessionSeed).network.nodes['ops_hr_db']!.connections,
    );
  });

  it('an edge removed by Aria stays removed', () => {
    const loaded = rebuilt(s => {
      const node = s.network.nodes['vpn_gateway']!;
      node.connections = node.connections.filter(id => id !== 'contractor_portal');
      node.discovered = true;
    });
    expect(loaded.network.nodes['vpn_gateway']!.connections).not.toContain('contractor_portal');
  });
});
