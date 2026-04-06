import { describe, it, expect } from 'vitest';
import { createInitialState, currentNode, addTrace, burnRetry, thresholdFlag } from './state';
import produce from './produce';

describe('addTrace', () => {
  it('should increase player trace by the given amount', () => {
    const state = createInitialState();
    const next = addTrace(state, 10);
    expect(next.player.trace).toBe(10);
  });

  it('should accumulate trace across multiple calls', () => {
    const state = createInitialState();
    const next = addTrace(addTrace(state, 5), 7);
    expect(next.player.trace).toBe(12);
  });

  it('should cap trace at 100', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 95;
    });
    const next = addTrace(state, 20);
    expect(next.player.trace).toBe(100);
  });

  it('should set phase to "burned" when trace reaches 100', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 95;
    });
    const next = addTrace(state, 10);
    expect(next.phase).toBe('burned');
  });

  it('should set phase to "burned" when trace is exactly 100', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 90;
    });
    const next = addTrace(state, 10);
    expect(next.phase).toBe('burned');
  });

  it('should not change phase to "burned" when trace stays below 100', () => {
    const state = createInitialState();
    const next = addTrace(state, 50);
    expect(next.phase).toBe('playing');
  });

  it('should not mutate the original state', () => {
    const state = createInitialState();
    addTrace(state, 30);
    expect(state.player.trace).toBe(0);
  });

  it('should not change phase when trace reaches 99', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 90;
    });
    const next = addTrace(state, 9);
    expect(next.phase).toBe('playing');
    expect(next.player.trace).toBe(99);
  });
});

describe('currentNode', () => {
  it('should return the node matching currentNodeId', () => {
    const state = createInitialState();
    const node = currentNode(state);
    expect(node.id).toBe('contractor_portal');
    expect(node.ip).toBe('10.0.0.1');
  });

  it('should return the correct node after currentNodeId changes', () => {
    const state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'vpn_gateway';
    });
    const node = currentNode(state);
    expect(node.id).toBe('vpn_gateway');
  });

  it('should throw when currentNodeId does not exist in the network', () => {
    const state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'nonexistent_node';
    });
    expect(() => currentNode(state)).toThrow('nonexistent_node');
  });
});

describe('createInitialState', () => {
  it('should set phase to "playing"', () => {
    const state = createInitialState();
    expect(state.phase).toBe('playing');
  });

  it('should start at contractor_portal', () => {
    const state = createInitialState();
    expect(state.network.currentNodeId).toBe('contractor_portal');
  });

  it('should have 0 trace', () => {
    const state = createInitialState();
    expect(state.player.trace).toBe(0);
  });

  it('should include exploit-kit and port-scanner tools', () => {
    const state = createInitialState();
    const toolIds = state.player.tools.map(t => t.id);
    expect(toolIds).toContain('exploit-kit');
    expect(toolIds).toContain('port-scanner');
  });

  it('should not include log-wiper initially', () => {
    const state = createInitialState();
    const toolIds = state.player.tools.map(t => t.id);
    expect(toolIds).not.toContain('log-wiper');
  });

  it('should have contractor_portal discovered', () => {
    const state = createInitialState();
    expect(state.network.nodes['contractor_portal']!.discovered).toBe(true);
  });

  it('should have vpn_gateway undiscovered', () => {
    const state = createInitialState();
    expect(state.network.nodes['vpn_gateway']!.discovered).toBe(false);
  });

  it('should start with 3 charges', () => {
    const state = createInitialState();
    expect(state.player.charges).toBe(3);
  });

  it('should have no obtained credentials initially', () => {
    const state = createInitialState();
    expect(state.player.credentials.every(c => !c.obtained)).toBe(true);
  });

  it('should have empty exfiltrated list', () => {
    const state = createInitialState();
    expect(state.player.exfiltrated).toHaveLength(0);
  });

  it('should generate a unique runId each call', () => {
    const s1 = createInitialState();
    const s2 = createInitialState();
    expect(s1.runId).not.toBe(s2.runId);
  });

  it('should have previousNodeId as null', () => {
    const state = createInitialState();
    expect(state.network.previousNodeId).toBeNull();
  });

  it('should have contractor_portal accessLevel of "none"', () => {
    const state = createInitialState();
    expect(state.network.nodes['contractor_portal']!.accessLevel).toBe('none');
  });

  it('should store sessionSeed on the returned state', () => {
    const seed = 12345;
    const state = createInitialState(seed);
    expect(state.sessionSeed).toBe(seed);
  });

  it('should produce identical node networks for the same seed', () => {
    const seed = 99887766;
    const s1 = createInitialState(seed);
    const s2 = createInitialState(seed);
    expect(s1.network.nodes).toEqual(s2.network.nodes);
    expect(s1.employees).toEqual(s2.employees);
    expect(s1.worldCredentials).toEqual(s2.worldCredentials);
  });

  it('should produce different node networks for different seeds', () => {
    // Use widely separated seeds to ensure PRNG output diverges meaningfully
    const s1 = createInitialState(1);
    const s2 = createInitialState(0xdeadbeef);
    // Seeded generation should change the generated network structure itself
    expect(s1.network.nodes).not.toEqual(s2.network.nodes);
    expect(s1.employees).not.toEqual(s2.employees);
  });
});

describe('addTrace — threshold flags', () => {
  it('should set threshold_31_crossed flag when trace crosses 31', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 20;
    });
    const next = addTrace(state, 15);
    expect(next.flags[thresholdFlag(31)]).toBe(true);
  });

  it('should set threshold_61_crossed flag when trace crosses 61', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 50;
    });
    const next = addTrace(state, 15);
    expect(next.flags[thresholdFlag(61)]).toBe(true);
  });

  it('should set threshold_86_crossed flag when trace crosses 86', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 80;
    });
    const next = addTrace(state, 10);
    expect(next.flags[thresholdFlag(86)]).toBe(true);
  });

  it('should not set a threshold flag if it is already present', () => {
    const flag = thresholdFlag(31);
    const state = produce(createInitialState(), s => {
      s.player.trace = 20;
      s.flags[flag] = true;
    });
    // Would cross 31 again, but flag already set — should remain true and not be re-set
    const next = addTrace(state, 15);
    // Flag stays true (was already set), no error — implementation guard prevents duplicate stamp
    expect(next.flags[flag]).toBe(true);
    // Verify by also checking the flag was present on the input (not freshly stamped)
    expect(state.flags[flag]).toBe(true);
  });

  it('should not set a flag when trace stays below the threshold', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 20;
    });
    const next = addTrace(state, 5); // 25 — still below 31
    expect(next.flags[thresholdFlag(31)]).toBeUndefined();
  });

  it('should set multiple flags in a single call when jumping across several thresholds', () => {
    const state = createInitialState(); // trace = 0
    const next = addTrace(state, 90); // 0 → 90, crosses 31, 61, and 86
    expect(next.flags[thresholdFlag(31)]).toBe(true);
    expect(next.flags[thresholdFlag(61)]).toBe(true);
    expect(next.flags[thresholdFlag(86)]).toBe(true);
  });

  it('should not set threshold_31_crossed flag when trace lands exactly at 30', () => {
    const state = createInitialState(); // trace = 0
    const next = addTrace(state, 30); // exactly 30 — does not reach 31
    expect(next.flags[thresholdFlag(31)]).toBeUndefined();
  });
});

describe('burnRetry', () => {
  it('should reset trace to 0', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
    });
    const next = burnRetry(state);
    expect(next.player.trace).toBe(0);
  });

  it('should set phase back to "playing"', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
    });
    const next = burnRetry(state);
    expect(next.phase).toBe('playing');
  });

  it('should move currentNodeId to contractor_portal when burned in layer 0', () => {
    // Layer 0 — contractor_portal is the current (and entry) node
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.network.currentNodeId = 'contractor_portal';
    });
    const next = burnRetry(state);
    expect(next.network.currentNodeId).toBe('contractor_portal');
  });

  it('should move currentNodeId to ops_cctv_ctrl when burned in layer 1', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.network.currentNodeId = 'ops_cctv_ctrl';
      s.network.nodes['ops_cctv_ctrl']!.compromised = true;
      s.network.nodes['ops_cctv_ctrl']!.accessLevel = 'admin';
    });
    const next = burnRetry(state);
    expect(next.network.currentNodeId).toBe('ops_cctv_ctrl');
  });

  it('should move to ops_cctv_ctrl when burned at ops_hr_db (non-entry layer-1 node)', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.network.currentNodeId = 'ops_hr_db';
      s.network.nodes['ops_hr_db']!.compromised = true;
      s.network.nodes['ops_hr_db']!.accessLevel = 'admin';
    });
    const next = burnRetry(state);
    expect(next.network.currentNodeId).toBe('ops_cctv_ctrl');
  });

  it('should set previousNodeId to null', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.network.previousNodeId = 'vpn_gateway';
    });
    const next = burnRetry(state);
    expect(next.network.previousNodeId).toBeNull();
  });

  it('should reset compromised nodes in the burned layer to accessLevel "none" and compromised false', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.network.currentNodeId = 'ops_cctv_ctrl';
      s.network.nodes['ops_cctv_ctrl']!.compromised = true;
      s.network.nodes['ops_cctv_ctrl']!.accessLevel = 'admin';
      s.network.nodes['ops_hr_db']!.compromised = true;
      s.network.nodes['ops_hr_db']!.accessLevel = 'user';
    });
    const next = burnRetry(state);
    expect(next.network.nodes['ops_cctv_ctrl']!.compromised).toBe(false);
    expect(next.network.nodes['ops_cctv_ctrl']!.accessLevel).toBe('none');
    expect(next.network.nodes['ops_hr_db']!.compromised).toBe(false);
    expect(next.network.nodes['ops_hr_db']!.accessLevel).toBe('none');
  });

  it('should not reset nodes in other layers', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.network.currentNodeId = 'ops_cctv_ctrl'; // burned in layer 1
      // Compromise a layer 0 node (should survive the retry)
      s.network.nodes['contractor_portal']!.compromised = true;
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    const next = burnRetry(state);
    expect(next.network.nodes['contractor_portal']!.compromised).toBe(true);
    expect(next.network.nodes['contractor_portal']!.accessLevel).toBe('admin');
  });

  it('should preserve player.exfiltrated', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.player.exfiltrated = [
        {
          name: 'payroll.csv',
          path: '/data/payroll.csv',
          type: 'document',
          content: 'salary data',
          exfiltrable: true,
          accessRequired: 'user',
        },
      ];
    });
    const next = burnRetry(state);
    expect(next.player.exfiltrated).toHaveLength(1);
    expect(next.player.exfiltrated[0]?.name).toBe('payroll.csv');
  });

  it('should preserve player.credentials including obtained ones', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      if (s.player.credentials[0]) {
        s.player.credentials[0].obtained = true;
      }
    });
    const next = burnRetry(state);
    expect(next.player.credentials[0]?.obtained).toBe(true);
  });

  it('should clear threshold flags', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.flags[thresholdFlag(31)] = true;
      s.flags[thresholdFlag(61)] = true;
      s.flags[thresholdFlag(86)] = true;
    });
    const next = burnRetry(state);
    expect(next.flags[thresholdFlag(31)]).toBeUndefined();
    expect(next.flags[thresholdFlag(61)]).toBeUndefined();
    expect(next.flags[thresholdFlag(86)]).toBeUndefined();
  });

  it('should preserve non-threshold flags', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.flags['some_story_flag'] = true;
      s.flags[thresholdFlag(31)] = true;
    });
    const next = burnRetry(state);
    expect(next.flags['some_story_flag']).toBe(true);
  });

  it('should unlock files that were locked in the burned layer', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.network.currentNodeId = 'ops_cctv_ctrl';
      const node = s.network.nodes['ops_cctv_ctrl']!;
      if (node.files[0]) {
        node.files[0].locked = true;
      }
    });
    const next = burnRetry(state);
    const node = next.network.nodes['ops_cctv_ctrl']!;
    expect(node.files.every(f => !f.locked)).toBe(true);
  });

  it('should clear locked files on nodes outside the burned layer without resetting their access', () => {
    // Burn at layer-1 (ops); a layer-0 node has a locked file from the 31% threshold callback.
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.network.currentNodeId = 'ops_cctv_ctrl'; // layer 1
      const portal = s.network.nodes['contractor_portal']!; // layer 0
      portal.accessLevel = 'user';
      portal.compromised = true;
      if (portal.files[0]) portal.files[0].locked = true;
    });
    const next = burnRetry(state);
    const portal = next.network.nodes['contractor_portal']!;
    // Lock cleared
    expect(portal.files.every(f => !f.locked)).toBe(true);
    // Access/compromise state preserved
    expect(portal.accessLevel).toBe('user');
    expect(portal.compromised).toBe(true);
  });

  it('should reset patched services to unpatched in the burned layer', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 100;
      s.phase = 'burned';
      s.network.currentNodeId = 'ops_cctv_ctrl';
      const node = s.network.nodes['ops_cctv_ctrl']!;
      if (node.services[0]) {
        node.services[0].patched = true;
      }
    });
    const next = burnRetry(state);
    const node = next.network.nodes['ops_cctv_ctrl']!;
    expect(node.services.every(s => !s.patched)).toBe(true);
  });
});
