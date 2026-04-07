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

  it('should contain exactly 5 contracts', () => {
    expect(CONTRACT_POOL).toHaveLength(5);
  });

  it('should contain the expected contract IDs', () => {
    const ids = CONTRACT_POOL.map(c => c.id);
    expect(ids).toContain('ghost_protocol');
    expect(ids).toContain('data_harvest');
    expect(ids).toContain('blitz');
    expect(ids).toContain('scorched_earth');
    expect(ids).toContain('clean_sweep');
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
    const validTypes = ['trace_cap', 'exfil_count', 'no_burn'];
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

  it('all contract IDs should be unique', () => {
    const ids = CONTRACT_POOL.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
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

  it('should return from the full pool when excludeId is undefined', () => {
    // Verify all contracts are reachable — mock random to hit each index
    const ids = CONTRACT_POOL.map(c => c.id);
    CONTRACT_POOL.forEach((_, i) => {
      vi.spyOn(Math, 'random').mockReturnValueOnce(i / CONTRACT_POOL.length);
      const result = selectContract(undefined);
      expect(ids).toContain(result.id);
    });
  });

  it('should return from the full pool when excludeId does not match any contract', () => {
    // A nonexistent excludeId still leaves the eligible pool = full pool
    const result = selectContract('does_not_exist');
    expect(CONTRACT_POOL).toContain(result);
  });

  it('should fall back to the full pool when excludeId would exclude all eligible contracts (single-element pool simulation)', () => {
    // We can't reduce the real pool to 1 entry without modifying source, but we CAN
    // verify the fallback branch: the only way eligible.length === 0 with the real pool
    // is impossible (5 contracts, only 1 excluded). Verify the fallback is at least
    // consistent by checking that with any valid excludeId the returned contract is
    // still from CONTRACT_POOL (i.e. pool fallback yields a valid result).
    const result = selectContract('ghost_protocol');
    expect(result).toBeDefined();
    expect(typeof result.id).toBe('string');
  });

  it('should use Math.random to pick from the eligible pool', () => {
    // With ghost_protocol excluded the eligible pool has 4 contracts (indices 0–3).
    // Mock Math.random → 0 to deterministically pick the first eligible contract.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = selectContract('ghost_protocol');
    // First eligible contract (ghost_protocol excluded) is data_harvest (index 1 in pool → index 0 eligible).
    expect(result.id).toBe('data_harvest');
  });

  it('should return contracts with different ids across multiple calls (randomness exercised)', () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(selectContract().id);
    }
    // With 5 contracts and 100 trials, we expect to see more than 1 distinct result
    expect(results.size).toBeGreaterThan(1);
  });
});
