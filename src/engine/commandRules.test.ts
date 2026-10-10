import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  connectBlockedMessage,
  exploitChargeCost,
  resolveCommand,
  scanTraceRange,
} from './commands';
import { createInitialState } from './state';
import produce from './produce';
import type { GameState, LiveNode, Service } from '../types/game';

const node = (s: GameState, id: string): LiveNode => {
  const n = s.network.nodes[id];
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

const at = (id: string, edit: (s: GameState) => void = () => undefined): GameState =>
  produce(createInitialState(), s => {
    s.network.currentNodeId = id;
    edit(s);
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connectBlockedMessage', () => {
  it('refuses a node that is not discovered', () => {
    const s = at('contractor_portal', st => {
      node(st, 'vpn_gateway').discovered = false;
    });
    expect(connectBlockedMessage(s, node(s, 'vpn_gateway'))).toBe(
      'No route to 10.0.0.2 — try scanning first',
    );
  });

  it('refuses the node the player is on', () => {
    const s = at('contractor_portal');
    expect(connectBlockedMessage(s, node(s, 'contractor_portal'))).toBe(
      'Already connected to 10.0.0.1',
    );
  });

  it('refuses a discovered node with no link and no session', () => {
    const s = at('contractor_portal', st => {
      node(st, 'ops_hr_db').discovered = true;
    });
    expect(connectBlockedMessage(s, node(s, 'ops_hr_db'))).toBe(
      'No direct route from 10.0.0.1 to 10.1.0.2',
    );
  });

  it('allows a linked node on the same layer', () => {
    const s = at('contractor_portal', st => {
      node(st, 'vpn_gateway').discovered = true;
    });
    expect(connectBlockedMessage(s, node(s, 'vpn_gateway'))).toBeNull();
  });

  it('allows a pivot to a node the player holds a session on', () => {
    const s = at('contractor_portal', st => {
      node(st, 'ops_hr_db').discovered = true;
      node(st, 'ops_hr_db').accessLevel = 'user';
    });
    expect(connectBlockedMessage(s, node(s, 'ops_hr_db'))).toBeNull();
  });

  it('blocks crossing a layer until the key anchor is compromised', () => {
    const s = at('vpn_gateway', st => {
      node(st, 'ops_cctv_ctrl').discovered = true;
    });
    expect(connectBlockedMessage(s, node(s, 'ops_cctv_ctrl'))).toBe(
      '// ACCESS DENIED — current layer incomplete — gain a foothold on 10.0.0.2 first',
    );
    const open = produce(s, st => {
      node(st, 'vpn_gateway').compromised = true;
    });
    expect(connectBlockedMessage(open, node(open, 'ops_cctv_ctrl'))).toBeNull();
  });

  it('is exactly what the connect command prints', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const s = at('contractor_portal', st => {
      node(st, 'ops_hr_db').discovered = true;
    });
    const result = await resolveCommand('connect 10.1.0.2', s);
    expect(result.lines.map(l => l.content)).toContain(
      connectBlockedMessage(s, node(s, 'ops_hr_db')),
    );
  });
});

describe('exploitChargeCost', () => {
  const svc: Service = {
    name: 'http',
    port: 80,
    vulnerable: true,
    exploitCost: 2,
    accessGained: 'user',
  };

  it('is the service cost on an ordinary node', () => {
    const s = at('contractor_portal');
    expect(exploitChargeCost(node(s, 'contractor_portal'), svc)).toBe(2);
  });

  it('costs one more on a node Sentinel has patched', () => {
    const s = at('contractor_portal', st => {
      node(st, 'contractor_portal').sentinelPatched = true;
    });
    expect(exploitChargeCost(node(s, 'contractor_portal'), svc)).toBe(3);
  });
});

describe('scanTraceRange', () => {
  it('is free while an unused port scanner is held', () => {
    expect(scanTraceRange(createInitialState())).toEqual({ min: 0, max: 0 });
  });

  it('is 1 to 2 once the scanner is used up', () => {
    const s = produce(createInitialState(), st => {
      for (const t of st.player.tools) if (t.id === 'port-scanner') t.used = true;
    });
    expect(scanTraceRange(s)).toEqual({ min: 1, max: 2 });
  });

  it('is 1 to 2 without a scanner at all', () => {
    const s = produce(createInitialState(), st => {
      st.player.tools = st.player.tools.filter(t => t.id !== 'port-scanner');
    });
    expect(scanTraceRange(s)).toEqual({ min: 1, max: 2 });
  });
});
