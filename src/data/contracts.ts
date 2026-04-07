import type { ContractDefinition, Tool, ToolId } from '../types/game';

// ── Tool registry ──────────────────────────────────────────
// Canonical tool object definitions used when applying contract loadouts.
// Descriptions must stay in sync with any mid-game tool-acquisition messages
// in commands.ts.
export const TOOL_REGISTRY: Record<ToolId, Tool> = {
  'port-scanner': {
    id: 'port-scanner',
    name: 'Port Scanner',
    description: 'Makes scan fully passive — 0 trace cost.',
  },
  'exploit-kit': {
    id: 'exploit-kit',
    name: 'Exploit Kit',
    description: 'Required to run exploit commands.',
  },
  'log-wiper': {
    id: 'log-wiper',
    name: 'Log Wiper',
    description: 'Single-use log sanitisation tool. Reduces trace by 15%. Destroyed after use.',
  },
  'spoof-id': {
    id: 'spoof-id',
    name: 'Spoof ID',
    description: 'Single-use. Reduces trace by 20%. Destroyed after use.',
  },
  decryptor: {
    id: 'decryptor',
    name: 'Decryptor',
    description: 'GPG decryption utility. Required to run the decrypt command.',
  },
  'aria-key': {
    id: 'aria-key',
    name: 'Aria Key',
    description: 'Authentication token granting access to the Aria subnetwork (172.16.0.0/16).',
  },
};

// ── Contract pool (run 2+) ─────────────────────────────────
export const CONTRACT_POOL: ContractDefinition[] = [
  {
    id: 'ghost_protocol',
    title: 'GHOST PROTOCOL',
    brief:
      "IronGate's security division has noticed irregular network activity. They're looking. You must stay below their detection threshold at all times.",
    objectiveDescription: 'Complete the run without exceeding 50% trace.',
    loadout: { exploitCharges: 2, startingTools: ['port-scanner', 'exploit-kit', 'spoof-id'] },
    networkVariant: 'standard',
    objectiveCondition: { type: 'trace_cap', maxTrace: 50 },
  },
  {
    id: 'data_harvest',
    title: 'DATA HARVEST',
    brief:
      "Nexus Corp needs financial data from IronGate's project archive. Volume matters — the more you extract, the stronger our leverage becomes.",
    objectiveDescription: 'Exfiltrate at least 3 files before completing the run.',
    loadout: { exploitCharges: 3, startingTools: ['port-scanner', 'exploit-kit'] },
    networkVariant: 'standard',
    objectiveCondition: { type: 'exfil_count', minCount: 3 },
  },
  {
    id: 'blitz',
    title: 'BLITZ',
    brief:
      'You have a narrow extraction window before IronGate rotates their security posture. Speed and resilience are your only tools.',
    objectiveDescription: 'Complete the run without being burned.',
    loadout: { exploitCharges: 5, startingTools: ['port-scanner', 'exploit-kit'] },
    networkVariant: 'standard',
    objectiveCondition: { type: 'no_burn' },
  },
  {
    id: 'scorched_earth',
    title: 'SCORCHED EARTH',
    brief:
      "Nexus Corp is tightening the budget. You're going in light — but we still expect results. Make every charge count.",
    objectiveDescription: 'Exfiltrate at least 5 files despite the reduced loadout.',
    loadout: {
      exploitCharges: 1,
      startingTools: ['port-scanner', 'exploit-kit', 'log-wiper'],
    },
    networkVariant: 'standard',
    objectiveCondition: { type: 'exfil_count', minCount: 5 },
  },
  {
    id: 'clean_sweep',
    title: 'CLEAN SWEEP',
    brief:
      'This operation must remain undetected at all costs. A legal challenge is pending — any forensic trace could compromise the entire operation.',
    objectiveDescription: 'Complete the run without exceeding 40% trace.',
    loadout: {
      exploitCharges: 3,
      startingTools: ['port-scanner', 'exploit-kit', 'log-wiper'],
    },
    networkVariant: 'standard',
    objectiveCondition: { type: 'trace_cap', maxTrace: 40 },
  },
];

// ── Helpers ────────────────────────────────────────────────
export const getContract = (id: string): ContractDefinition | undefined =>
  CONTRACT_POOL.find(c => c.id === id);

/**
 * Pick a random contract from the pool, optionally excluding one by ID.
 * Falls back to a random contract from the full pool if all are excluded (edge case with pool of 1).
 */
export const selectContract = (excludeId?: string): ContractDefinition => {
  const eligible = excludeId ? CONTRACT_POOL.filter(c => c.id !== excludeId) : CONTRACT_POOL;
  const pool = eligible.length > 0 ? eligible : CONTRACT_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
};
