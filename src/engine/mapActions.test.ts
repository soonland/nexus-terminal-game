import { describe, it, expect } from 'vitest';
import { nodeActions } from './mapActions';
import { createInitialState } from './state';
import produce from './produce';
import type { Credential, GameState, LiveNode, Tool } from '../types/game';

const node = (s: GameState, id: string): LiveNode => {
  const n = s.network.nodes[id];
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

const withEdit = (edit: (s: GameState) => void): GameState => produce(createInitialState(), edit);

const cred = (over: Partial<Credential> = {}): Credential => ({
  id: 'cred_test',
  username: 'ops.admin',
  password: 'Hunter2!',
  accessLevel: 'admin',
  validOnNodes: ['contractor_portal'],
  obtained: true,
  ...over,
});

const tool = (id: Tool['id'], used = false): Tool => ({ id, name: id, description: id, used });

const kinds = (actions: ReturnType<typeof nodeActions>) => actions.map(a => a.kind);

describe('nodeActions — when the menu is empty', () => {
  it('offers nothing for a node that is not discovered or does not exist', () => {
    const s = createInitialState();
    expect(nodeActions(s, 'ops_hr_db')).toEqual([]);
    expect(nodeActions(s, 'nope')).toEqual([]);
  });

  it('offers nothing at the decision terminal', () => {
    const s = withEdit(st => {
      node(st, 'aria_decision').discovered = true;
      st.network.currentNodeId = 'aria_decision';
    });
    expect(nodeActions(s, 'aria_decision')).toEqual([]);
    expect(nodeActions(s, 'contractor_portal')).toEqual([]);
  });

  it('offers nothing once the run is burned or ended', () => {
    for (const phase of ['burned', 'ended'] as const) {
      const s = withEdit(st => {
        st.phase = phase;
      });
      expect(nodeActions(s, 'contractor_portal')).toEqual([]);
    }
  });

  it('still offers actions in the aria phase, which is ordinary play after the subnet key', () => {
    const s = withEdit(st => {
      st.phase = 'aria';
    });
    expect(nodeActions(s, 'contractor_portal').length).toBeGreaterThan(0);
  });
});

describe('nodeActions — a node the player is not on', () => {
  const linked = (): GameState =>
    withEdit(st => {
      node(st, 'vpn_gateway').discovered = true;
    });

  it('offers Connect and Scan, with Scan marked as costing trace', () => {
    const actions = nodeActions(linked(), 'vpn_gateway');
    expect(kinds(actions)).toEqual(['connect', 'scan-host']);
    const [connect, scan] = actions;
    expect(connect).toMatchObject({
      command: 'connect 10.0.0.2',
      cost: null,
      confirm: false,
      disabledReason: null,
    });
    expect(scan).toMatchObject({
      command: 'scan 10.0.0.2',
      cost: '+0 trace (port scanner)',
      confirm: true,
      disabledReason: null,
    });
  });

  it('prices a scan at +1–2 trace without a port scanner', () => {
    const s = withEdit(st => {
      node(st, 'vpn_gateway').discovered = true;
      st.player.tools = st.player.tools.filter(t => t.id !== 'port-scanner');
    });
    expect(nodeActions(s, 'vpn_gateway')[1]?.cost).toBe('+1–2 trace');
  });

  it('disables Connect with the command’s own message when there is no route', () => {
    const s = withEdit(st => {
      node(st, 'ops_hr_db').discovered = true;
    });
    const [connect, scan] = nodeActions(s, 'ops_hr_db');
    expect(connect.disabledReason).toBe('No direct route from 10.0.0.1 to 10.1.0.2');
    expect(scan.disabledReason).toBeNull();
  });

  it('enables Connect for a pivot to a node the player holds a session on', () => {
    const s = withEdit(st => {
      node(st, 'ops_hr_db').discovered = true;
      node(st, 'ops_hr_db').accessLevel = 'user';
    });
    expect(nodeActions(s, 'ops_hr_db')[0]?.disabledReason).toBeNull();
  });
});

describe('nodeActions — the current node', () => {
  it('offers Scan host and Scan subnet, never Connect', () => {
    const actions = nodeActions(createInitialState(), 'contractor_portal');
    expect(kinds(actions)).toContain('scan-host');
    expect(kinds(actions)).toContain('scan-subnet');
    expect(kinds(actions)).not.toContain('connect');
    expect(actions.find(a => a.kind === 'scan-subnet')?.command).toBe('scan');
    expect(actions.find(a => a.kind === 'scan-host')?.command).toBe('scan 10.0.0.1');
  });

  describe('login', () => {
    const loginState = (credentials: Credential[], access: LiveNode['accessLevel'] = 'none') =>
      withEdit(st => {
        st.player.credentials = credentials;
        node(st, 'contractor_portal').accessLevel = access;
      });
    const logins = (s: GameState) =>
      nodeActions(s, 'contractor_portal').filter(a => a.kind === 'login');

    it('offers one entry per obtained credential valid here, with the password only in the command', () => {
      const [entry] = logins(loginState([cred()]));
      expect(entry).toMatchObject({
        label: 'Login as ops.admin',
        command: 'login ops.admin Hunter2!',
        cost: null,
        confirm: false,
        disabledReason: null,
      });
      expect(entry.label).not.toContain('Hunter2!');
    });

    it('skips revoked, un-obtained and wrong-node credentials', () => {
      const s = loginState([
        cred({ id: 'a', revoked: true }),
        cred({ id: 'b', obtained: false }),
        cred({ id: 'c', validOnNodes: ['vpn_gateway'] }),
      ]);
      expect(logins(s)).toEqual([]);
    });

    it('skips a credential that would not raise the access the player already has here', () => {
      expect(logins(loginState([cred({ accessLevel: 'user' })], 'user'))).toEqual([]);
      expect(logins(loginState([cred({ accessLevel: 'user' })], 'admin'))).toEqual([]);
      expect(logins(loginState([cred({ accessLevel: 'admin' })], 'user'))).toHaveLength(1);
    });
  });

  describe('exploit', () => {
    const exploits = (s: GameState) =>
      nodeActions(s, 'contractor_portal').filter(a => a.kind === 'exploit');
    const vulnerable = (s: GameState) =>
      node(s, 'contractor_portal').services.filter(v => v.vulnerable && !v.patched);

    it('does not list services of a host that has not been scanned', () => {
      const s = createInitialState();
      expect(vulnerable(s).length).toBeGreaterThan(0);
      expect(exploits(s)).toEqual([
        {
          id: 'exploit-hint',
          kind: 'exploit',
          label: 'Exploit',
          command: '',
          cost: null,
          confirm: false,
          disabledReason: 'Scan this host to find services',
        },
      ]);
    });

    it('lists the vulnerable services of a scanned host, priced in charges and trace', () => {
      const s = withEdit(st => {
        st.scanned = ['contractor_portal'];
      });
      const entries = exploits(s);
      expect(entries.map(e => e.command)).toEqual(vulnerable(s).map(v => `exploit ${v.name}`));
      const first = vulnerable(s)[0];
      expect(entries[0]).toMatchObject({
        confirm: true,
        disabledReason: null,
        cost: `${String(first.exploitCost)} charge${first.exploitCost === 1 ? '' : 's'}, ~+${String(first.traceContribution ?? 2)} trace (+10 if it fails)`,
      });
    });

    it('treats a compromised host as scanned', () => {
      const s = withEdit(st => {
        node(st, 'contractor_portal').compromised = true;
      });
      expect(exploits(s)[0]?.command).toMatch(/^exploit /);
    });

    it('never lists a patched or non-vulnerable service', () => {
      const s = withEdit(st => {
        st.scanned = ['contractor_portal'];
        for (const v of node(st, 'contractor_portal').services) v.patched = true;
      });
      expect(exploits(s)).toEqual([]);
    });

    it('adds one charge to the price on a Sentinel-patched node', () => {
      const plain = withEdit(st => {
        st.scanned = ['contractor_portal'];
      });
      const patched = produce(plain, st => {
        node(st, 'contractor_portal').sentinelPatched = true;
      });
      const base = vulnerable(plain)[0].exploitCost;
      expect(exploits(plain)[0]?.cost).toContain(`${String(base)} charge`);
      expect(exploits(patched)[0]?.cost).toContain(`${String(base + 1)} charge`);
    });

    it('is disabled, with the reason, without the kit or without enough charges', () => {
      const noKit = withEdit(st => {
        st.scanned = ['contractor_portal'];
        st.player.tools = st.player.tools.filter(t => t.id !== 'exploit-kit');
      });
      expect(exploits(noKit)[0]?.disabledReason).toBe('exploit-kit tool required');
      const broke = withEdit(st => {
        st.scanned = ['contractor_portal'];
        st.player.charges = 0;
      });
      expect(exploits(broke)[0]?.disabledReason).toMatch(
        /^Insufficient charges \(need \d+, have 0\)$/,
      );
    });
  });

  describe('disconnect and tools', () => {
    it('offers a way back only when there is a previous node', () => {
      expect(kinds(nodeActions(createInitialState(), 'contractor_portal'))).not.toContain(
        'disconnect',
      );
      const s = withEdit(st => {
        node(st, 'vpn_gateway').discovered = true;
        st.network.currentNodeId = 'vpn_gateway';
        st.network.previousNodeId = 'contractor_portal';
      });
      const back = nodeActions(s, 'vpn_gateway').find(a => a.kind === 'disconnect');
      expect(back).toMatchObject({
        command: 'disconnect',
        cost: null,
        confirm: false,
        disabledReason: null,
      });
      expect(back?.label).toBe(`Back to ${node(s, 'contractor_portal').label}`);
    });

    it('offers Wipe logs and Spoof only while the tool is held and unused, and asks to confirm', () => {
      const s = withEdit(st => {
        st.player.tools = [...st.player.tools, tool('log-wiper'), tool('spoof-id')];
      });
      const actions = nodeActions(s, 'contractor_portal');
      expect(actions.find(a => a.kind === 'wipe-logs')).toMatchObject({
        command: 'wipe-logs',
        cost: '−15 trace, uses the log wiper',
        confirm: true,
      });
      expect(actions.find(a => a.kind === 'spoof')).toMatchObject({
        command: 'spoof',
        cost: '−20 trace, uses the spoof tool',
        confirm: true,
      });
      const used = withEdit(st => {
        st.player.tools = [...st.player.tools, tool('log-wiper', true), tool('spoof-id', true)];
      });
      expect(kinds(nodeActions(used, 'contractor_portal'))).not.toContain('wipe-logs');
      expect(kinds(nodeActions(used, 'contractor_portal'))).not.toContain('spoof');
      expect(kinds(nodeActions(createInitialState(), 'contractor_portal'))).not.toContain('spoof');
    });
  });

  it('confirms exactly the actions that cost something', () => {
    const s = withEdit(st => {
      st.scanned = ['contractor_portal'];
      st.player.credentials = [cred()];
      st.player.tools = [...st.player.tools, tool('log-wiper'), tool('spoof-id')];
      node(st, 'vpn_gateway').discovered = true;
      st.network.previousNodeId = 'vpn_gateway';
    });
    for (const action of nodeActions(s, 'contractor_portal')) {
      const costs = ['scan-host', 'scan-subnet', 'exploit', 'wipe-logs', 'spoof'].includes(
        action.kind,
      );
      if (action.command === '') continue;
      expect([action.kind, action.confirm]).toEqual([action.kind, costs]);
      expect([action.kind, action.cost !== null]).toEqual([action.kind, costs]);
    }
  });

  it('gives every entry in one menu a unique id', () => {
    const s = withEdit(st => {
      st.scanned = ['contractor_portal'];
      st.player.credentials = [cred(), cred({ id: 'cred_other', username: 'other.user' })];
    });
    const ids = nodeActions(s, 'contractor_portal').map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
