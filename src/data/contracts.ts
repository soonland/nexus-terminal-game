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

// ── Contract pool ──────────────────────────────────────────
// unlockedAfterRun: 0 → available from run 2 (first contracted run)
//                   1 → available from run 3
//                   2 → available from run 4 (full pool)
export const CONTRACT_POOL: ContractDefinition[] = [
  // ── Run 2+ (basic pool) ────────────────────────────────
  {
    id: 'ghost_protocol',
    title: 'GHOST PROTOCOL',
    brief:
      "IronGate's security division has noticed irregular network activity. They're looking. You must stay below their detection threshold at all times.",
    objectiveDescription: 'Complete the run without exceeding 50% trace.',
    loadout: { exploitCharges: 2, startingTools: ['port-scanner', 'exploit-kit', 'spoof-id'] },
    networkVariant: 'standard',
    objectiveCondition: { type: 'trace_cap', maxTrace: 50 },
    unlockedAfterRun: 0,
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
    unlockedAfterRun: 0,
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
    unlockedAfterRun: 0,
  },

  // ── Run 3+ (mid pool) ──────────────────────────────────
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
    unlockedAfterRun: 1,
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
    unlockedAfterRun: 1,
  },
  {
    id: 'inside_job',
    title: 'INSIDE JOB',
    brief:
      "Someone inside IronGate's security team has opened a window — brief, deniable, and closing soon. Use the access while it lasts and pull whatever you can on their internal contacts.",
    objectiveDescription:
      "Exfiltrate the HR employee roster to expose IronGate's security division personnel.",
    loadout: {
      exploitCharges: 3,
      startingTools: ['port-scanner', 'exploit-kit'],
      startingCredentials: ['cred_sec_analyst'],
    },
    networkVariant: 'standard',
    objectiveCondition: { type: 'identify_employee', divisionId: 'security' },
    unlockedAfterRun: 1,
    rewardOnComplete: 'SECURITY_INSIDER_IDENTIFIED',
  },

  // ── Run 4+ (full pool) ─────────────────────────────────
  {
    id: 'paper_trail',
    title: 'PAPER TRAIL',
    brief:
      "The Q4 wire transfer records tell a story IronGate would rather keep buried. Our client needs them unredacted. The files are encrypted — come prepared, or don't come at all.",
    objectiveDescription: 'Exfiltrate the Q4 wire transfer records from the finance database.',
    loadout: {
      exploitCharges: 3,
      startingTools: ['port-scanner', 'exploit-kit', 'decryptor'],
    },
    networkVariant: 'standard',
    objectiveCondition: { type: 'exfil_file', targetFileName: 'wire_transfers_q4.csv' },
    unlockedAfterRun: 2,
    rewardOnComplete: 'WIRE_TRANSFERS_OBTAINED',
  },
  {
    id: 'dark_corridor',
    title: 'DARK CORRIDOR',
    brief:
      "IronGate's security division runs its own counter-intelligence operation. We have reason to believe this channel is being monitored. Avoid their network entirely — find another path to your objective.",
    objectiveDescription:
      'Complete the run without compromising any node in the security division.',
    loadout: { exploitCharges: 4, startingTools: ['port-scanner', 'exploit-kit'] },
    networkVariant: 'standard',
    objectiveCondition: { type: 'avoid_division', divisionId: 'security' },
    unlockedAfterRun: 2,
    rewardOnComplete: 'SECURITY_BYPASSED',
  },
  {
    id: 'board_exposure',
    title: 'BOARD EXPOSURE',
    brief:
      "IronGate's board has been authorising operations they cannot legally sanction — and they kept minutes. The legal division has the documentation. Extract it before the next external audit erases it.",
    objectiveDescription:
      'Exfiltrate the October board meeting minutes from the executive legal node.',
    loadout: {
      exploitCharges: 5,
      startingTools: ['port-scanner', 'exploit-kit'],
    },
    networkVariant: 'standard',
    objectiveCondition: { type: 'exfil_file', targetFileName: 'board_minutes_oct.pdf' },
    unlockedAfterRun: 2,
    rewardOnComplete: 'BOARD_EXPOSED',
  },
  {
    id: 'zero_footprint',
    title: 'ZERO FOOTPRINT',
    brief:
      "Our client has a specific interest in IronGate's finance personnel — names, clearance levels, access patterns. The HR records are the only source that covers all of them. Pull it clean and get out.",
    objectiveDescription:
      "Exfiltrate the HR employee roster to expose IronGate's finance division personnel.",
    loadout: {
      exploitCharges: 3,
      startingTools: ['port-scanner', 'exploit-kit'],
      startingCredentials: ['cred_fin_analyst'],
    },
    networkVariant: 'standard',
    objectiveCondition: { type: 'identify_employee', divisionId: 'finance' },
    unlockedAfterRun: 2,
    rewardOnComplete: 'FINANCE_PERSONNEL_IDENTIFIED',
  },
];

// ── Helpers ────────────────────────────────────────────────
export const getContract = (id: string): ContractDefinition | undefined =>
  CONTRACT_POOL.find(c => c.id === id);

/**
 * Pick a random contract from the pool.
 *
 * @param excludeId - Contract ID to exclude (e.g. the one just completed).
 * @param runsCompleted - Number of completed runs from the dossier; filters out contracts
 *   whose `unlockedAfterRun` exceeds this value. Defaults to 0 (basic pool only).
 *
 * Falls back to the unfiltered eligible pool if all unlocked contracts are excluded,
 * and to the full pool if the unlocked pool itself is empty (should not happen in practice).
 */
export const selectContract = (excludeId?: string, runsCompleted = 0): ContractDefinition => {
  const unlocked = CONTRACT_POOL.filter(c => (c.unlockedAfterRun ?? 0) <= runsCompleted);
  const base = unlocked.length > 0 ? unlocked : CONTRACT_POOL;
  const eligible = excludeId ? base.filter(c => c.id !== excludeId) : base;
  const pool = eligible.length > 0 ? eligible : base;
  return pool[Math.floor(Math.random() * pool.length)];
};
