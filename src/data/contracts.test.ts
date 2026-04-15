import { describe, it, expect, vi, afterEach } from 'vitest';
import { TOOL_REGISTRY, CONTRACT_POOL, getContract, selectContract } from './contracts';
import type { ToolId } from '../types/game';

// ── TOOL_REGISTRY ─────────────────────────────────────────

describe('TOOL_REGISTRY', () => {
  const ALL_TOOL_IDS: ToolId[] = [
    'port-scanner',
    'exploit-kit',
    'log-wiper',
    'spoof-id',
    'decryptor',
    'aria-key',
  ];

  it('should contain all 6 ToolIds', () => {
    expect(Object.keys(TOOL_REGISTRY)).toHaveLength(6);
    for (const id of ALL_TOOL_IDS) {
      expect(TOOL_REGISTRY).toHaveProperty(id);
    }
  });

  it.each(ALL_TOOL_IDS)('tool "%s" should have a non-empty id, name, and description', id => {
    const tool = TOOL_REGISTRY[id];
    expect(tool.id).toBe(id);
    expect(typeof tool.name).toBe('string');
    expect(tool.name.length).toBeGreaterThan(0);
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(0);
  });
});

// ── CONTRACT_POOL ─────────────────────────────────────────

describe('CONTRACT_POOL', () => {
  const REQUIRED_FIELDS = [
    'id',
    'title',
    'brief',
    'objectiveDescription',
    'loadout',
    'networkVariant',
    'objectiveCondition',
  ] as const;

  it('should contain exactly 10 contracts', () => {
    expect(CONTRACT_POOL).toHaveLength(10);
  });

  it('should contain the expected contract IDs', () => {
    const ids = CONTRACT_POOL.map(c => c.id);
    // Basic pool (run 2+)
    expect(ids).toContain('ghost_protocol');
    expect(ids).toContain('data_harvest');
    expect(ids).toContain('blitz');
    // Mid pool (run 3+)
    expect(ids).toContain('scorched_earth');
    expect(ids).toContain('clean_sweep');
    expect(ids).toContain('inside_job');
    // Full pool (run 4+)
    expect(ids).toContain('paper_trail');
    expect(ids).toContain('dark_corridor');
    expect(ids).toContain('board_exposure');
    expect(ids).toContain('zero_footprint');
  });

  it.each(CONTRACT_POOL)(
    'contract "$id" should have all required fields with non-empty string values',
    contract => {
      for (const field of REQUIRED_FIELDS) {
        expect(contract).toHaveProperty(field);
      }
      expect(contract.id.length).toBeGreaterThan(0);
      expect(contract.title.length).toBeGreaterThan(0);
      expect(contract.brief.length).toBeGreaterThan(0);
      expect(contract.objectiveDescription.length).toBeGreaterThan(0);
      expect(contract.networkVariant.length).toBeGreaterThan(0);
    },
  );

  it.each(CONTRACT_POOL)(
    'contract "$id" loadout should have a positive exploitCharges and a startingTools array',
    contract => {
      expect(typeof contract.loadout.exploitCharges).toBe('number');
      expect(contract.loadout.exploitCharges).toBeGreaterThan(0);
      expect(Array.isArray(contract.loadout.startingTools)).toBe(true);
    },
  );

  it.each(CONTRACT_POOL)(
    'contract "$id" startingTools should all be valid ToolIds present in TOOL_REGISTRY',
    contract => {
      for (const toolId of contract.loadout.startingTools) {
        expect(TOOL_REGISTRY).toHaveProperty(toolId);
      }
    },
  );

  it.each(CONTRACT_POOL)('contract "$id" objectiveCondition should have a known type', contract => {
    const validTypes = [
      'trace_cap',
      'exfil_count',
      'no_burn',
      'exfil_file',
      'identify_employee',
      'avoid_division',
    ];
    expect(validTypes).toContain(contract.objectiveCondition.type);
  });

  it('ghost_protocol should have a trace_cap condition at 50', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'ghost_protocol')!;
    expect(contract.objectiveCondition).toEqual({ type: 'trace_cap', maxTrace: 50 });
  });

  it('clean_sweep should have a trace_cap condition at 40', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'clean_sweep')!;
    expect(contract.objectiveCondition).toEqual({ type: 'trace_cap', maxTrace: 40 });
  });

  it('data_harvest should have an exfil_count condition at 3', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'data_harvest')!;
    expect(contract.objectiveCondition).toEqual({ type: 'exfil_count', minCount: 3 });
  });

  it('scorched_earth should have an exfil_count condition at 5', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'scorched_earth')!;
    expect(contract.objectiveCondition).toEqual({ type: 'exfil_count', minCount: 5 });
  });

  it('blitz should have a no_burn condition', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'blitz')!;
    expect(contract.objectiveCondition).toEqual({ type: 'no_burn' });
  });

  it('paper_trail should have an exfil_file condition for wire_transfers_q4.csv', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'paper_trail')!;
    expect(contract.objectiveCondition).toEqual({
      type: 'exfil_file',
      targetFileName: 'wire_transfers_q4.csv',
    });
  });

  it('board_exposure should have an exfil_file condition for board_minutes_oct.pdf', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'board_exposure')!;
    expect(contract.objectiveCondition).toEqual({
      type: 'exfil_file',
      targetFileName: 'board_minutes_oct.pdf',
    });
  });

  it('dark_corridor should have an avoid_division condition for security', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'dark_corridor')!;
    expect(contract.objectiveCondition).toEqual({ type: 'avoid_division', divisionId: 'security' });
  });

  it('inside_job should have an identify_employee condition for security division', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'inside_job')!;
    expect(contract.objectiveCondition).toEqual({
      type: 'identify_employee',
      divisionId: 'security',
    });
  });

  it('zero_footprint should have an identify_employee condition for finance division', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'zero_footprint')!;
    expect(contract.objectiveCondition).toEqual({
      type: 'identify_employee',
      divisionId: 'finance',
    });
  });

  it('all contract IDs should be unique', () => {
    const ids = CONTRACT_POOL.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ── unlockedAfterRun progression ─────────────────────────
  it('basic pool (unlockedAfterRun=0) should have exactly 3 contracts', () => {
    const basic = CONTRACT_POOL.filter(c => (c.unlockedAfterRun ?? 0) === 0);
    expect(basic).toHaveLength(3);
    expect(basic.map(c => c.id)).toEqual(
      expect.arrayContaining(['ghost_protocol', 'data_harvest', 'blitz']),
    );
  });

  it('mid pool (unlockedAfterRun=1) should have exactly 3 contracts', () => {
    const mid = CONTRACT_POOL.filter(c => (c.unlockedAfterRun ?? 0) === 1);
    expect(mid).toHaveLength(3);
    expect(mid.map(c => c.id)).toEqual(
      expect.arrayContaining(['scorched_earth', 'clean_sweep', 'inside_job']),
    );
  });

  it('full pool addition (unlockedAfterRun=2) should have exactly 4 contracts', () => {
    const full = CONTRACT_POOL.filter(c => (c.unlockedAfterRun ?? 0) === 2);
    expect(full).toHaveLength(4);
    expect(full.map(c => c.id)).toEqual(
      expect.arrayContaining(['paper_trail', 'dark_corridor', 'board_exposure', 'zero_footprint']),
    );
  });

  // ── rewardOnComplete ──────────────────────────────────────
  it('contracts with rewardOnComplete should have non-empty string values', () => {
    for (const contract of CONTRACT_POOL) {
      if (contract.rewardOnComplete !== undefined) {
        expect(contract.rewardOnComplete.length).toBeGreaterThan(0);
      }
    }
  });

  it('inside_job should reward SECURITY_INSIDER_IDENTIFIED on completion', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'inside_job')!;
    expect(contract.rewardOnComplete).toBe('SECURITY_INSIDER_IDENTIFIED');
  });

  it('paper_trail should reward WIRE_TRANSFERS_OBTAINED on completion', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'paper_trail')!;
    expect(contract.rewardOnComplete).toBe('WIRE_TRANSFERS_OBTAINED');
  });

  it('dark_corridor should reward SECURITY_BYPASSED on completion', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'dark_corridor')!;
    expect(contract.rewardOnComplete).toBe('SECURITY_BYPASSED');
  });

  it('board_exposure should reward BOARD_EXPOSED on completion', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'board_exposure')!;
    expect(contract.rewardOnComplete).toBe('BOARD_EXPOSED');
  });

  it('zero_footprint should reward FINANCE_PERSONNEL_IDENTIFIED on completion', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'zero_footprint')!;
    expect(contract.rewardOnComplete).toBe('FINANCE_PERSONNEL_IDENTIFIED');
  });

  // ── Insider loadout contracts ─────────────────────────────
  it('inside_job should start with cred_sec_analyst pre-obtained', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'inside_job')!;
    expect(contract.loadout.startingCredentials).toContain('cred_sec_analyst');
  });

  it('zero_footprint should start with cred_fin_analyst pre-obtained', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'zero_footprint')!;
    expect(contract.loadout.startingCredentials).toContain('cred_fin_analyst');
  });

  // ── Equipped loadout contracts ────────────────────────────
  it('paper_trail should include decryptor in startingTools', () => {
    const contract = CONTRACT_POOL.find(c => c.id === 'paper_trail')!;
    expect(contract.loadout.startingTools).toContain('decryptor');
  });
});

// ── getContract ───────────────────────────────────────────

describe('getContract', () => {
  it('should return the ghost_protocol contract when queried by id', () => {
    const result = getContract('ghost_protocol');
    expect(result).toBeDefined();
    expect(result!.id).toBe('ghost_protocol');
    expect(result!.title).toBe('GHOST PROTOCOL');
  });

  it('should return the data_harvest contract when queried by id', () => {
    const result = getContract('data_harvest');
    expect(result).toBeDefined();
    expect(result!.id).toBe('data_harvest');
  });

  it('should return the blitz contract when queried by id', () => {
    const result = getContract('blitz');
    expect(result).toBeDefined();
    expect(result!.id).toBe('blitz');
  });

  it('should return the scorched_earth contract when queried by id', () => {
    const result = getContract('scorched_earth');
    expect(result).toBeDefined();
    expect(result!.id).toBe('scorched_earth');
  });

  it('should return the clean_sweep contract when queried by id', () => {
    const result = getContract('clean_sweep');
    expect(result).toBeDefined();
    expect(result!.id).toBe('clean_sweep');
  });

  it('should return the inside_job contract when queried by id', () => {
    const result = getContract('inside_job');
    expect(result).toBeDefined();
    expect(result!.id).toBe('inside_job');
    expect(result!.title).toBe('INSIDE JOB');
  });

  it('should return the paper_trail contract when queried by id', () => {
    const result = getContract('paper_trail');
    expect(result).toBeDefined();
    expect(result!.id).toBe('paper_trail');
  });

  it('should return the dark_corridor contract when queried by id', () => {
    const result = getContract('dark_corridor');
    expect(result).toBeDefined();
    expect(result!.id).toBe('dark_corridor');
  });

  it('should return the board_exposure contract when queried by id', () => {
    const result = getContract('board_exposure');
    expect(result).toBeDefined();
    expect(result!.id).toBe('board_exposure');
  });

  it('should return the zero_footprint contract when queried by id', () => {
    const result = getContract('zero_footprint');
    expect(result).toBeDefined();
    expect(result!.id).toBe('zero_footprint');
  });

  it('should return undefined for a nonexistent id', () => {
    expect(getContract('nonexistent')).toBeUndefined();
  });

  it('should return undefined for an empty string', () => {
    expect(getContract('')).toBeUndefined();
  });

  it('should return the same object reference as in CONTRACT_POOL', () => {
    const result = getContract('ghost_protocol');
    const poolEntry = CONTRACT_POOL.find(c => c.id === 'ghost_protocol');
    expect(result).toBe(poolEntry);
  });
});

// ── selectContract ────────────────────────────────────────

describe('selectContract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a ContractDefinition from the pool when called without arguments', () => {
    const result = selectContract();
    expect(CONTRACT_POOL).toContain(result);
  });

  it('should never return the excluded contract when a valid excludeId is provided', () => {
    // Run many times to defeat random chance
    for (let i = 0; i < 50; i++) {
      const result = selectContract('ghost_protocol');
      expect(result.id).not.toBe('ghost_protocol');
    }
  });

  it('should still return a ContractDefinition from the pool when excludeId is provided', () => {
    const result = selectContract('ghost_protocol');
    expect(CONTRACT_POOL).toContain(result);
  });

  it('should return only basic-pool contracts on the first contracted run (runsCompleted=1)', () => {
    // runsCompleted=1 is the smallest value App.tsx passes (gate is runsCompleted > 0).
    // With < semantics: unlockedAfterRun=0 → 0 < 1 ✓, unlockedAfterRun=1 → 1 < 1 ✗
    const basicIds = ['ghost_protocol', 'data_harvest', 'blitz'];
    for (let i = 0; i < 50; i++) {
      expect(basicIds).toContain(selectContract(undefined, 1).id);
    }
  });

  it('should not return locked contracts when runsCompleted is 1', () => {
    const lockedIds = [
      'scorched_earth',
      'clean_sweep',
      'inside_job',
      'paper_trail',
      'dark_corridor',
      'board_exposure',
      'zero_footprint',
    ];
    for (let i = 0; i < 50; i++) {
      const result = selectContract(undefined, 1);
      expect(lockedIds).not.toContain(result.id);
    }
  });

  it('should include run-3 contracts when runsCompleted is 2', () => {
    // unlockedAfterRun=1 → 1 < 2 ✓ — mid-pool unlocks for run 3
    const midPoolIds = [
      'ghost_protocol',
      'data_harvest',
      'blitz',
      'scorched_earth',
      'clean_sweep',
      'inside_job',
    ];
    const results = new Set<string>();
    for (let i = 0; i < 200; i++) results.add(selectContract(undefined, 2).id);
    for (const id of midPoolIds) expect(results).toContain(id);
    // Run-4-only contracts should not appear
    expect(results).not.toContain('paper_trail');
    expect(results).not.toContain('dark_corridor');
  });

  it('should return any of the 10 contracts when runsCompleted is 3 (full pool)', () => {
    // unlockedAfterRun=2 → 2 < 3 ✓ — full pool available from run 4
    const results = new Set<string>();
    for (let i = 0; i < 300; i++) results.add(selectContract(undefined, 3).id);
    expect(results.size).toBe(10);
  });

  it('should return from the base pool when excludeId does not match any contract', () => {
    const result = selectContract('does_not_exist', 1);
    expect(CONTRACT_POOL).toContain(result);
  });

  it('should return a valid contract when excludeId does not match any eligible contract', () => {
    // With runsCompleted=1 the base pool has 3 contracts. Excluding a nonexistent ID
    // leaves the eligible pool unchanged — verifies normal selection still works.
    const result = selectContract('nonexistent', 1);
    expect(result).toBeDefined();
    expect(typeof result.id).toBe('string');
  });

  it('should fall back to the full CONTRACT_POOL when runsCompleted filters out all contracts', () => {
    // runsCompleted=0 with < semantics: no contract has unlockedAfterRun < 0,
    // so unlocked=[] → triggers the CONTRACT_POOL fallback.
    const result = selectContract(undefined, 0);
    expect(CONTRACT_POOL).toContain(result);
  });

  it('should use Math.random to pick from the eligible pool', () => {
    // With ghost_protocol excluded and runsCompleted=1, the eligible basic pool has 2
    // contracts: [data_harvest, blitz]. Math.random → 0 picks index 0 → data_harvest.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = selectContract('ghost_protocol', 1);
    expect(result.id).toBe('data_harvest');
  });

  it('should return contracts with different ids across multiple calls (randomness exercised)', () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(selectContract(undefined, 3).id);
    }
    // With 10 contracts and 100 trials, expect multiple distinct results
    expect(results.size).toBeGreaterThan(1);
  });
});
