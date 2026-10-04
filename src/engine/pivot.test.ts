import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from './commands';
import { saveGame, loadGame } from './persistence';
import { createInitialState } from './state';
import produce from './produce';
import { LAYER_KEY_ANCHOR } from './buildConnectivity';
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

const text = (lines: { content: string }[]): string => lines.map(l => l.content).join('\n');

// A player deep in the executive layer who holds a session on the HR database (layer 1).
const deepWithHr = (access: 'none' | 'user' | 'admin' = 'admin'): GameState =>
  produce(createInitialState(), s => {
    s.network.currentNodeId = 'exec_ceo';
    s.network.nodes['exec_ceo']!.discovered = true;
    const hr = s.network.nodes['ops_hr_db']!;
    hr.discovered = true;
    hr.accessLevel = access;
  });

describe('connect — pivoting to a node you hold', () => {
  it('reaches a held node on another layer from anywhere', async () => {
    const result = await resolveCommand('connect 10.1.0.2', deepWithHr());
    const next = result.nextState as GameState;
    expect(next.network.currentNodeId).toBe('ops_hr_db');
    expect(next.network.previousNodeId).toBe('exec_ceo');
    expect(text(result.lines)).toMatch(/Pivoting through your session on 10\.1\.0\.2/);
  });

  it('is refused for a discovered node you have no session on', async () => {
    const result = await resolveCommand('connect 10.1.0.2', deepWithHr('none'));
    expect((result.nextState as GameState).network.currentNodeId).toBe('exec_ceo');
    expect(text(result.lines)).toMatch(/No direct route from 10\.4\.0\.3 to 10\.1\.0\.2/);
  });

  it('does not make unheld nodes on other layers reachable', async () => {
    const state = produce(createInitialState(), s => {
      s.network.nodes['fin_payments_db']!.discovered = true;
    });
    const result = await resolveCommand('connect 10.3.0.1', state);
    expect((result.nextState as GameState).network.currentNodeId).toBe('contractor_portal');
    expect(text(result.lines)).toMatch(/No direct route/);
  });

  it('leaves normal links and layer gating exactly as they were', async () => {
    const gated = produce(createInitialState(), s => {
      s.network.currentNodeId = 'vpn_gateway';
      s.network.nodes['vpn_gateway']!.discovered = true;
      s.network.nodes['ops_cctv_ctrl']!.discovered = true;
      s.network.nodes[LAYER_KEY_ANCHOR[0] ?? 'contractor_portal']!.compromised = true;
    });
    const linked = await resolveCommand('connect 10.1.0.1', gated);
    expect((linked.nextState as GameState).network.currentNodeId).toBe('ops_cctv_ctrl');
    expect(text(linked.lines)).toContain('Connecting to 10.1.0.1');
    expect(text(linked.lines)).not.toContain('Pivoting');
  });

  it('refuses to connect to the node you are already on', async () => {
    const state = deepWithHr();
    const result = await resolveCommand('connect 10.4.0.3', state);
    expect((result.nextState as GameState).network.previousNodeId).toBeNull();
    expect(text(result.lines)).toMatch(/Already connected to 10\.4\.0\.3/);
  });

  it('disconnect returns to where the pivot started', async () => {
    const pivoted = (await resolveCommand('connect 10.1.0.2', deepWithHr())).nextState as GameState;
    const back = await resolveCommand('disconnect', pivoted);
    expect((back.nextState as GameState).network.currentNodeId).toBe('exec_ceo');
  });

  it('still works after a save and a load', async () => {
    saveGame(deepWithHr());
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    const result = await resolveCommand('connect 10.1.0.2', loaded as GameState);
    expect((result.nextState as GameState).network.currentNodeId).toBe('ops_hr_db');
  });

  it('is blocked at the decision terminal, like every other connect', async () => {
    const state = produce(deepWithHr(), s => {
      s.network.currentNodeId = 'aria_decision';
      s.network.nodes['aria_decision']!.discovered = true;
    });
    const result = await resolveCommand('connect 10.1.0.2', state);
    expect(
      (result.nextState as GameState | undefined)?.network.currentNodeId ?? 'aria_decision',
    ).toBe('aria_decision');
    expect(text(result.lines)).toMatch(/INPUT REJECTED/);
  });
});

describe('connect — the access shown after the subnet key authenticates', () => {
  it('prints USER, not NONE, when the key just granted access', async () => {
    const state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'aria_behavioural';
      s.network.nodes['aria_core']!.discovered = true;
      s.player.tools.push({ id: 'subnet-key', name: 'Restricted Subnet Key', description: 'key' });
    });
    const result = await resolveCommand('connect 172.16.0.4', state);
    expect(text(result.lines)).toContain('Access: USER');
    expect(text(result.lines)).not.toContain('authenticate to proceed');
  });
});
