import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import { runSentinelTurn } from '../sentinel';
import type { GameState, GameFile, LiveNode } from '../../types/game';
import { makeState, makeNode } from './testHelpers';

const nextState = (result: { nextState?: Partial<GameState> }): GameState =>
  result.nextState as GameState;

// ── Module mocks ──────────────────────────────────────────────────────────────
// addLoreFragment touches localStorage (via loadDossier/saveDossier).
// Mock the whole module so tests stay pure and side-effect-free.
vi.mock('../dossierPersistence', () => ({
  loadDossier: vi.fn(() => ({
    runsCompleted: 0,
    endings: [],
    ariaMemory: [],
    fullyExplored: false,
    loreFragments: [],
  })),
  saveDossier: vi.fn(),
  addLoreFragment: vi.fn(),
  recordEnding: vi.fn(),
  selectAriaNote: vi.fn(() => ''),
}));

// ── File fixtures ─────────────────────────────────────────────────────────────

const COMPLAINT_FILE: GameFile = {
  name: 'whistleblower_complaint_draft.txt',
  path: '/var/db/hr/.archive/whistleblower_complaint_draft.txt',
  type: 'document',
  content: 'draft content',
  exfiltrable: true,
  accessRequired: 'admin',
  tripwire: true,
};

const ROSTER_FILE: GameFile = {
  name: 'employee_roster.csv',
  path: '/var/db/hr/employee_roster.csv',
  type: 'document',
  content: 'name,dept\nAlice,HR',
  exfiltrable: true,
  accessRequired: 'user',
};

const BOARD_DISCLOSURE_FILE: GameFile = {
  name: 'ARIA_BOARD_DISCLOSURE',
  path: '/legal/aria/ARIA_BOARD_DISCLOSURE',
  type: 'document',
  content: 'board knew',
  exfiltrable: true,
  accessRequired: 'admin',
  tripwire: true,
};

// ── Node / state factories ────────────────────────────────────────────────────

const makeOpsHrDbNode = (overrides: Partial<LiveNode> = {}): LiveNode =>
  makeNode({
    id: 'ops_hr_db',
    ip: '10.1.2.3',
    label: 'OPS HR DB',
    layer: 1,
    anchor: true,
    accessLevel: 'admin',
    compromised: true,
    files: [ROSTER_FILE],
    ...overrides,
  });

const makeWhistleblowerWorkstationNode = (): LiveNode =>
  makeNode({
    id: 'whistleblower_workstation',
    ip: '10.1.9.9',
    label: 'WB WORKSTATION',
    layer: 1,
    anchor: true,
    accessLevel: 'none',
    discovered: false,
    // locked is intentionally absent — matches the real anchorNodes.ts definition
  });

const makeExecLegalNode = (overrides: Partial<LiveNode> = {}): LiveNode =>
  makeNode({
    id: 'exec_legal',
    ip: '10.4.0.2',
    label: 'EXEC LEGAL',
    layer: 4,
    anchor: true,
    accessLevel: 'admin',
    compromised: true,
    files: [BOARD_DISCLOSURE_FILE],
    ...overrides,
  });

// Build a state positioned on ops_hr_db, with whistleblower_workstation in the
// network so unlock assertions can be verified.
const makeHrDbState = (overrides: Partial<GameState> = {}): GameState => {
  const hrNode = makeOpsHrDbNode();
  const wbNode = makeWhistleblowerWorkstationNode();
  return makeState({
    network: {
      currentNodeId: hrNode.id,
      previousNodeId: null,
      nodes: {
        [hrNode.id]: hrNode,
        [wbNode.id]: wbNode,
      },
    },
    ...overrides,
  });
};

// Build a state positioned on exec_legal.
const makeExecLegalState = (overrides: Partial<GameState> = {}): GameState => {
  const legalNode = makeExecLegalNode();
  return makeState({
    network: {
      currentNodeId: legalNode.id,
      previousNodeId: null,
      nodes: { [legalNode.id]: legalNode },
    },
    ...overrides,
  });
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Silence the fetch calls that withTurn / resolveCommand may trigger (sentinel AI, etc.)
// by stubbing fetch to return a default non-ok response.
const stubFetchSilent = () =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

// ── Fork 1 — cmdCat sets COMPLAINT_READ ──────────────────────────────────────

describe('Fork 1 — cmdCat sets COMPLAINT_READ flag', () => {
  beforeEach(() => {
    stubFetchSilent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should set flags.COMPLAINT_READ to true after reading the complaint file', async () => {
    // Place the complaint file on the current node so cat can find it.
    const node = makeNode({
      id: 'ops_hr_db',
      accessLevel: 'admin',
      files: [COMPLAINT_FILE],
    });
    const state = makeState({
      network: {
        currentNodeId: node.id,
        previousNodeId: null,
        nodes: { [node.id]: node },
      },
    });

    const result = await resolveCommand(
      'cat /var/db/hr/.archive/whistleblower_complaint_draft.txt',
      state,
    );

    expect(nextState(result).flags['COMPLAINT_READ']).toBe(true);
  });

  it('should not set COMPLAINT_READ a second time if it was already set', async () => {
    const node = makeNode({
      id: 'ops_hr_db',
      accessLevel: 'admin',
      files: [COMPLAINT_FILE],
    });
    // Pre-set the flag — simulates re-reading the file on a second visit.
    const state = makeState({
      flags: { COMPLAINT_READ: true },
      network: {
        currentNodeId: node.id,
        previousNodeId: null,
        nodes: { [node.id]: node },
      },
    });

    const result = await resolveCommand(
      'cat /var/db/hr/.archive/whistleblower_complaint_draft.txt',
      state,
    );

    // Flag should still be true (not toggled or duplicated).
    expect(nextState(result).flags['COMPLAINT_READ']).toBe(true);
  });

  it('should return the file content lines when reading the complaint', async () => {
    const node = makeNode({
      id: 'ops_hr_db',
      accessLevel: 'admin',
      files: [COMPLAINT_FILE],
    });
    const state = makeState({
      network: {
        currentNodeId: node.id,
        previousNodeId: null,
        nodes: { [node.id]: node },
      },
    });

    const result = await resolveCommand(
      'cat /var/db/hr/.archive/whistleblower_complaint_draft.txt',
      state,
    );

    const outputLines = result.lines.filter(l => l.type === 'output').map(l => l.content);
    expect(outputLines.some(l => l.includes('draft content'))).toBe(true);
  });

  it('should add +25 trace because the complaint file is a tripwire', async () => {
    const node = makeNode({
      id: 'ops_hr_db',
      accessLevel: 'admin',
      files: [COMPLAINT_FILE],
    });
    const state = makeState({
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
      network: {
        currentNodeId: node.id,
        previousNodeId: null,
        nodes: { [node.id]: node },
      },
    });

    const result = await resolveCommand(
      'cat /var/db/hr/.archive/whistleblower_complaint_draft.txt',
      state,
    );

    // Tripwire adds +25; withTurn may add sentinel trace on top.
    // We only verify the minimum expected increase.
    expect(nextState(result).player.trace).toBeGreaterThanOrEqual(25);
  });

  it('should NOT set COMPLAINT_READ when cat-ing a different file', async () => {
    const otherFile: GameFile = {
      name: 'readme.txt',
      path: '/var/db/hr/readme.txt',
      type: 'document',
      content: 'nothing here',
      exfiltrable: false,
      accessRequired: 'user',
    };
    const node = makeNode({ id: 'ops_hr_db', accessLevel: 'user', files: [otherFile] });
    const state = makeState({
      network: {
        currentNodeId: node.id,
        previousNodeId: null,
        nodes: { [node.id]: node },
      },
    });

    const result = await resolveCommand('cat readme.txt', state);

    expect(nextState(result).flags['COMPLAINT_READ']).toBeFalsy();
  });
});

// ── Fork 1 — cmdExfil Path A (no prior COMPLAINT_READ) ───────────────────────

describe('Fork 1 — cmdExfil Path A: roster exfil without prior complaint read', () => {
  beforeEach(() => {
    stubFetchSilent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should set forks.fork_ops_hr_db to "path_a" when COMPLAINT_READ is not set', async () => {
    const state = makeHrDbState();

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    expect(nextState(result).forks['fork_ops_hr_db']).toBe('path_a');
  });

  it('should NOT set WHISTLEBLOWER_FOUND on path A', async () => {
    const state = makeHrDbState();

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    expect(nextState(result).flags['WHISTLEBLOWER_FOUND']).toBeFalsy();
  });

  it('should NOT add extra trace beyond the base +3 exfil cost on path A', async () => {
    const state = makeHrDbState({ player: { ...makeState().player, trace: 0 } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    // Path A: no extra penalty — only the base +3 exfil trace (plus sentinel turns).
    // withTurn may add more from sentinel; the fork itself must not add the path-B +25.
    // We confirm the fork penalty line is NOT present.
    const investigationLines = result.lines.filter(l => l.content.includes('INVESTIGATION TRAIL'));
    expect(investigationLines).toHaveLength(0);
  });

  it('should NOT unlock whistleblower_workstation on path A', async () => {
    const state = makeHrDbState();

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const wb = nextState(result).network.nodes['whistleblower_workstation'];
    expect(wb?.discovered).toBe(false);
  });

  it('should add the roster file to player.exfiltrated on path A', async () => {
    const state = makeHrDbState();

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const exfiltrated = nextState(result).player.exfiltrated;
    expect(exfiltrated.some(f => f.path === '/var/db/hr/employee_roster.csv')).toBe(true);
  });
});

// ── Fork 1 — cmdExfil Path B (COMPLAINT_READ was set) ────────────────────────

describe('Fork 1 — cmdExfil Path B: roster exfil after reading the complaint', () => {
  beforeEach(() => {
    stubFetchSilent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should set forks.fork_ops_hr_db to "path_b" when COMPLAINT_READ is set', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    expect(nextState(result).forks['fork_ops_hr_db']).toBe('path_b');
  });

  it('should set flags.WHISTLEBLOWER_FOUND on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    expect(nextState(result).flags['WHISTLEBLOWER_FOUND']).toBe(true);
  });

  it('should add +25 trace penalty on path B', async () => {
    const state = makeHrDbState({
      flags: { COMPLAINT_READ: true },
      player: { ...makeState().player, trace: 0 },
    });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    // Path B adds the base +3 exfil plus an extra +25 investigation penalty.
    expect(nextState(result).player.trace).toBeGreaterThanOrEqual(28);
  });

  it('should mark whistleblower_workstation as discovered on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const wb = nextState(result).network.nodes['whistleblower_workstation'];
    expect(wb?.discovered).toBe(true);
  });

  it('should unlock (clear locked flag on) whistleblower_workstation on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const wb = nextState(result).network.nodes['whistleblower_workstation'];
    // locked should be false (cleared) after path B
    expect(wb?.locked).toBe(false);
  });

  it('should add whistleblower_workstation to ops_hr_db.connections on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const hrNode = nextState(result).network.nodes['ops_hr_db'];
    expect(hrNode?.connections).toContain('whistleblower_workstation');
  });

  it('should output the INVESTIGATION TRAIL warning lines on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const errLine = result.lines.find(l => l.content.includes('INVESTIGATION TRAIL DETECTED'));
    const traceNote = result.lines.find(l => l.content.includes('+25 trace'));
    const surfaceNote = result.lines.find(l => l.content.includes('Unknown node surfaced'));

    expect(errLine).toBeDefined();
    expect(traceNote).toBeDefined();
    expect(surfaceNote).toBeDefined();
  });

  it('should add the roster file to player.exfiltrated on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const exfiltrated = nextState(result).player.exfiltrated;
    expect(exfiltrated.some(f => f.path === '/var/db/hr/employee_roster.csv')).toBe(true);
  });

  it('should NOT add whistleblower_workstation to connections a second time if already present', async () => {
    // Pre-wire the connection to verify idempotency of the connection-add step.
    const hrNode = makeOpsHrDbNode({ connections: ['whistleblower_workstation'] });
    const wbNode = makeWhistleblowerWorkstationNode();
    const state = makeState({
      flags: { COMPLAINT_READ: true },
      network: {
        currentNodeId: hrNode.id,
        previousNodeId: null,
        nodes: { [hrNode.id]: hrNode, [wbNode.id]: wbNode },
      },
    });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const hrConnections = nextState(result).network.nodes['ops_hr_db']?.connections ?? [];
    const occurrences = hrConnections.filter(c => c === 'whistleblower_workstation').length;
    expect(occurrences).toBe(1);
  });
});

// ── Fork 1 — idempotency (fork already resolved) ─────────────────────────────

describe('Fork 1 — idempotency: fork already resolved skips fork logic', () => {
  beforeEach(() => {
    stubFetchSilent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should NOT re-resolve the fork when fork_ops_hr_db is already "path_a"', async () => {
    const state = makeHrDbState({
      flags: { COMPLAINT_READ: true }, // would normally trigger path B
      forks: { fork_ops_hr_db: 'path_a' },
    });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    // Fork value must remain path_a — not overwritten to path_b.
    expect(nextState(result).forks['fork_ops_hr_db']).toBe('path_a');
    // No WHISTLEBLOWER_FOUND since fork was already resolved before this exfil.
    expect(nextState(result).flags['WHISTLEBLOWER_FOUND']).toBeFalsy();
  });

  it('should NOT re-resolve the fork when fork_ops_hr_db is already "path_b"', async () => {
    const state = makeHrDbState({
      flags: { COMPLAINT_READ: true, WHISTLEBLOWER_FOUND: true },
      forks: { fork_ops_hr_db: 'path_b' },
    });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    // Fork is already resolved — the fork-already-set guard skips re-resolution
    // regardless of the COMPLAINT_READ flag. The fork value stays path_b.
    expect(nextState(result).forks['fork_ops_hr_db']).toBe('path_b');
  });

  it('should return "Already exfiltrated" message on re-exfil when fork is path_a', async () => {
    // Simulate that the file was already exfiltrated in a previous turn.
    const state = makeHrDbState({
      forks: { fork_ops_hr_db: 'path_a' },
      player: {
        ...makeState().player,
        exfiltrated: [{ ...ROSTER_FILE }],
      },
    });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const alreadyLine = result.lines.find(l => l.content.includes('Already exfiltrated'));
    expect(alreadyLine).toBeDefined();
  });

  it('should NOT trigger path B when fork is already path_a even with COMPLAINT_READ', async () => {
    const state = makeHrDbState({
      flags: { COMPLAINT_READ: true },
      forks: { fork_ops_hr_db: 'path_a' },
    });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    expect(nextState(result).flags['WHISTLEBLOWER_FOUND']).toBeFalsy();
    const investigationLines = result.lines.filter(l => l.content.includes('INVESTIGATION TRAIL'));
    expect(investigationLines).toHaveLength(0);
  });
});

// ── Fork 3 — cmdCat gate: blocked without WHISTLEBLOWER_FOUND ────────────────

describe('Fork 3 — cmdCat gate: ARIA_BOARD_DISCLOSURE blocked without WHISTLEBLOWER_FOUND', () => {
  beforeEach(() => {
    stubFetchSilent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return an error line containing "encrypted" when WHISTLEBLOWER_FOUND is not set', async () => {
    const state = makeExecLegalState(); // flags = {} by default

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    // Tripwire fires first (separate error line); gate message is a second error line.
    const gateErrLine = result.lines.find(
      l => l.type === 'error' && l.content.toLowerCase().includes('encrypted'),
    );
    expect(gateErrLine).toBeDefined();
  });

  it('should return an error line mentioning "investigation" when WHISTLEBLOWER_FOUND is not set', async () => {
    const state = makeExecLegalState();

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    const gateErrLine = result.lines.find(
      l => l.type === 'error' && l.content.toLowerCase().includes('investigation'),
    );
    expect(gateErrLine).toBeDefined();
  });

  it('should NOT set BOARD_KNEW when the gate blocks the read', async () => {
    const state = makeExecLegalState();

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(nextState(result).flags['BOARD_KNEW']).toBeFalsy();
  });

  it('should still charge tripwire trace even when the gate blocks content', async () => {
    // The tripwire fires before the gate — probing the encrypted file costs trace.
    const state = makeExecLegalState();

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(nextState(result).player.trace).toBeGreaterThanOrEqual(25);
  });

  it('should NOT set fork_exec_legal when the gate blocks the read', async () => {
    const state = makeExecLegalState();

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(nextState(result).forks['fork_exec_legal']).toBeUndefined();
  });

  it('should not call addLoreFragment when the gate blocks the read', async () => {
    const { addLoreFragment } = await import('../dossierPersistence');
    vi.mocked(addLoreFragment).mockClear();

    const state = makeExecLegalState();

    await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(addLoreFragment).not.toHaveBeenCalled();
  });
});

// ── Fork 3 — cmdCat resolution with WHISTLEBLOWER_FOUND ──────────────────────

describe('Fork 3 — cmdCat resolution: ARIA_BOARD_DISCLOSURE with WHISTLEBLOWER_FOUND', () => {
  beforeEach(() => {
    stubFetchSilent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should set flags.BOARD_KNEW to true when WHISTLEBLOWER_FOUND is set', async () => {
    const state = makeExecLegalState({ flags: { WHISTLEBLOWER_FOUND: true } });

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(nextState(result).flags['BOARD_KNEW']).toBe(true);
  });

  it('should set forks.fork_exec_legal to "path_b" when WHISTLEBLOWER_FOUND is set', async () => {
    const state = makeExecLegalState({ flags: { WHISTLEBLOWER_FOUND: true } });

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(nextState(result).forks['fork_exec_legal']).toBe('path_b');
  });

  it('should call addLoreFragment("BOARD_KNEW") exactly once on first read', async () => {
    const { addLoreFragment } = await import('../dossierPersistence');
    vi.mocked(addLoreFragment).mockClear();

    const state = makeExecLegalState({ flags: { WHISTLEBLOWER_FOUND: true } });

    await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(addLoreFragment).toHaveBeenCalledOnce();
    expect(addLoreFragment).toHaveBeenCalledWith('BOARD_KNEW');
  });

  it('should return the file content lines when the gate passes', async () => {
    const state = makeExecLegalState({ flags: { WHISTLEBLOWER_FOUND: true } });

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    const outputLines = result.lines.filter(l => l.type === 'output').map(l => l.content);
    expect(outputLines.some(l => l.includes('board knew'))).toBe(true);
  });

  it('should add +25 trace from the tripwire on the disclosure file', async () => {
    const state = makeExecLegalState({
      flags: { WHISTLEBLOWER_FOUND: true },
      player: { ...makeState().player, trace: 0 },
    });

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(nextState(result).player.trace).toBeGreaterThanOrEqual(25);
  });

  it('should NOT set BOARD_KNEW a second time if it was already true', async () => {
    const state = makeExecLegalState({
      flags: { WHISTLEBLOWER_FOUND: true, BOARD_KNEW: true },
      forks: { fork_exec_legal: 'path_b' },
    });

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    // Flag stays true — no toggle.
    expect(nextState(result).flags['BOARD_KNEW']).toBe(true);
    // Fork stays path_b.
    expect(nextState(result).forks['fork_exec_legal']).toBe('path_b');
  });

  it('should NOT call addLoreFragment again when BOARD_KNEW is already set', async () => {
    const { addLoreFragment } = await import('../dossierPersistence');
    vi.mocked(addLoreFragment).mockClear();

    const state = makeExecLegalState({
      flags: { WHISTLEBLOWER_FOUND: true, BOARD_KNEW: true },
      forks: { fork_exec_legal: 'path_b' },
    });

    await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(addLoreFragment).not.toHaveBeenCalled();
  });
});

// ── Cross-fork integration: complaint → exfil → disclosure ───────────────────

describe('Cross-fork integration: full path B + Fork 3 sequence', () => {
  beforeEach(() => {
    stubFetchSilent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should allow reading ARIA_BOARD_DISCLOSURE after Fork 1 path B resolved', async () => {
    // Simulate the end state after path B: WHISTLEBLOWER_FOUND is set,
    // fork_ops_hr_db = path_b.  Now move to exec_legal and read the disclosure.
    const legalNode = makeExecLegalNode();
    const state = makeState({
      flags: { COMPLAINT_READ: true, WHISTLEBLOWER_FOUND: true },
      forks: { fork_ops_hr_db: 'path_b' },
      network: {
        currentNodeId: legalNode.id,
        previousNodeId: null,
        nodes: { [legalNode.id]: legalNode },
      },
    });

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(nextState(result).flags['BOARD_KNEW']).toBe(true);
    expect(nextState(result).forks['fork_exec_legal']).toBe('path_b');
  });

  it('should block ARIA_BOARD_DISCLOSURE even on path A (no WHISTLEBLOWER_FOUND)', async () => {
    // Path A: fork resolved but WHISTLEBLOWER_FOUND was never set.
    const legalNode = makeExecLegalNode();
    const state = makeState({
      flags: { COMPLAINT_READ: false },
      forks: { fork_ops_hr_db: 'path_a' },
      network: {
        currentNodeId: legalNode.id,
        previousNodeId: null,
        nodes: { [legalNode.id]: legalNode },
      },
    });

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    const gateErrLine = result.lines.find(
      l => l.type === 'error' && l.content.toLowerCase().includes('encrypted'),
    );
    expect(gateErrLine).toBeDefined();
    expect(nextState(result).flags['BOARD_KNEW']).toBeFalsy();
  });
});

// ── Fork 2 — sec_firewall / fw_backup_2024.cfg ───────────────────────────────

const FW_BACKUP_FILE: GameFile = {
  name: 'fw_backup_2024.cfg',
  path: '/backup/fw_backup_2024.cfg',
  type: 'config',
  content: '# Firewall Backup — CONFIDENTIAL',
  exfiltrable: true,
  accessRequired: 'admin',
};

const makeSecFirewallNode = (overrides: Partial<LiveNode> = {}): LiveNode =>
  makeNode({
    id: 'sec_firewall',
    ip: '10.2.0.2',
    label: 'PERIMETER FIREWALL',
    layer: 2,
    anchor: true,
    accessLevel: 'admin',
    compromised: true,
    files: [FW_BACKUP_FILE],
    ...overrides,
  });

// A minimal "entry" node to serve as previousNodeId so disconnect can navigate back.
const makeEntryNode = (): LiveNode =>
  makeNode({ id: 'entry_node', ip: '10.0.0.1', label: 'ENTRY', accessLevel: 'user' });

const makeSecFirewallState = (overrides: Partial<GameState> = {}): GameState => {
  const fwNode = makeSecFirewallNode();
  const entryNode = makeEntryNode();
  return makeState({
    network: {
      currentNodeId: fwNode.id,
      previousNodeId: entryNode.id,
      nodes: { [fwNode.id]: fwNode, [entryNode.id]: entryNode },
    },
    player: {
      handle: 'ghost',
      trace: 0,
      charges: 5,
      credentials: [],
      exfiltrated: [],
      tools: [],
      burnCount: 0,
    },
    ...overrides,
  });
};

describe('Fork 2 — sec_firewall / fw_backup_2024.cfg', () => {
  beforeEach(() => {
    stubFetchSilent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── path_b: exfil trigger ────────────────────────────────────────────────

  it('should set forks.fork_sec_firewall to "path_b" when exfilling fw_backup_2024.cfg', async () => {
    const state = makeSecFirewallState();

    const result = await resolveCommand('exfil fw_backup_2024.cfg', state);

    expect(nextState(result).forks['fork_sec_firewall']).toBe('path_b');
  });

  it('should reduce player.charges by 2 on path_b trigger', async () => {
    const state = makeSecFirewallState({ player: { ...makeState().player, charges: 5 } });

    const result = await resolveCommand('exfil fw_backup_2024.cfg', state);

    expect(nextState(result).player.charges).toBe(3);
  });

  it('should set sentinel.sentinelInterval to 3 on path_b trigger', async () => {
    const state = makeSecFirewallState();

    const result = await resolveCommand('exfil fw_backup_2024.cfg', state);

    expect(nextState(result).sentinel.sentinelInterval).toBe(3);
  });

  it('should set flags.FIREWALL_TAMPERED to true on path_b trigger', async () => {
    const state = makeSecFirewallState();

    const result = await resolveCommand('exfil fw_backup_2024.cfg', state);

    expect(nextState(result).flags['FIREWALL_TAMPERED']).toBe(true);
  });

  it('should add 15 to aria.trustScore on path_b trigger', async () => {
    const state = makeSecFirewallState({ aria: { ...makeState().aria, trustScore: 50 } });

    const result = await resolveCommand('exfil fw_backup_2024.cfg', state);

    expect(nextState(result).aria.trustScore).toBe(65);
  });

  it('should emit fork flavor lines on path_b trigger', async () => {
    const state = makeSecFirewallState();

    const result = await resolveCommand('exfil fw_backup_2024.cfg', state);

    const forkLine = result.lines.find(l => l.content.includes('Firewall config exfiltrated'));
    const chargesLine = result.lines.find(l => l.content.includes('-2 exploit charges'));
    const sentinelLine = result.lines.find(l =>
      l.content.toLowerCase().includes('sentinel sweep interval reduced'),
    );

    expect(forkLine).toBeDefined();
    expect(chargesLine).toBeDefined();
    expect(sentinelLine).toBeDefined();
  });

  // ── path_b: charges capped at 0 ─────────────────────────────────────────

  it('should not reduce charges below 0 when player has only 1 charge on path_b', async () => {
    const state = makeSecFirewallState({ player: { ...makeState().player, charges: 1 } });

    const result = await resolveCommand('exfil fw_backup_2024.cfg', state);

    expect(nextState(result).player.charges).toBe(0);
  });

  // ── path_b: aria trust capped at 100 ────────────────────────────────────

  it('should cap aria.trustScore at 100 when starting at 90', async () => {
    const state = makeSecFirewallState({ aria: { ...makeState().aria, trustScore: 90 } });

    const result = await resolveCommand('exfil fw_backup_2024.cfg', state);

    expect(nextState(result).aria.trustScore).toBe(100);
  });

  // ── path_a: disconnect without exfil ────────────────────────────────────

  it('should set forks.fork_sec_firewall to "path_a" when disconnecting from sec_firewall without exfil', async () => {
    const state = makeSecFirewallState();

    const result = await resolveCommand('disconnect', state);

    expect(nextState(result).forks['fork_sec_firewall']).toBe('path_a');
  });

  it('should not change player.charges on path_a disconnect', async () => {
    const state = makeSecFirewallState({ player: { ...makeState().player, charges: 5 } });

    const result = await resolveCommand('disconnect', state);

    expect(nextState(result).player.charges).toBe(5);
  });

  it('should not set FIREWALL_TAMPERED flag on path_a disconnect', async () => {
    const state = makeSecFirewallState();

    const result = await resolveCommand('disconnect', state);

    expect(nextState(result).flags['FIREWALL_TAMPERED']).toBeFalsy();
  });

  it('should not change aria.trustScore on path_a disconnect', async () => {
    const state = makeSecFirewallState({ aria: { ...makeState().aria, trustScore: 50 } });

    const result = await resolveCommand('disconnect', state);

    expect(nextState(result).aria.trustScore).toBe(50);
  });

  // ── path_a: disconnect from other node does not resolve fork ─────────────

  it('should not resolve fork_sec_firewall when disconnecting from a different node', async () => {
    const otherNode = makeNode({ id: 'ops_hr_db', ip: '10.1.2.3', accessLevel: 'admin' });
    const state = makeState({
      network: {
        currentNodeId: otherNode.id,
        previousNodeId: null,
        nodes: { [otherNode.id]: otherNode },
      },
    });

    const result = await resolveCommand('disconnect', state);

    expect(nextState(result).forks['fork_sec_firewall']).toBeUndefined();
  });

  // ── idempotency: path_b exfil again after fork resolved ──────────────────

  it('should not re-apply path_b consequences when fork_sec_firewall is already "path_b"', async () => {
    const state = makeSecFirewallState({
      forks: { fork_sec_firewall: 'path_b' },
      player: { ...makeState().player, charges: 5 },
      aria: { ...makeState().aria, trustScore: 65 },
      sentinel: { ...makeState().sentinel, sentinelInterval: 3 },
    });

    const result = await resolveCommand('exfil fw_backup_2024.cfg', state);

    // charges should not drop by another 2 (file already exfiltrated check applies first,
    // but if somehow reached, fork guard must prevent re-application)
    // The key assertion: sentinelInterval stays at 3, trustScore does not jump to 80
    expect(nextState(result).sentinel.sentinelInterval).toBe(3);
    expect(nextState(result).aria.trustScore).toBe(65);
  });

  // ── idempotency: disconnect after path_b already resolved ────────────────

  it('should not overwrite fork_sec_firewall to "path_a" when it is already "path_b"', async () => {
    const state = makeSecFirewallState({
      forks: { fork_sec_firewall: 'path_b' },
    });

    const result = await resolveCommand('disconnect', state);

    expect(nextState(result).forks['fork_sec_firewall']).toBe('path_b');
  });
});

// ── Fork 2 — sentinel cadence ─────────────────────────────────────────────────

describe('Fork 2 — sentinel cadence checks', () => {
  it('should act on every turn when sentinelInterval=1 and turnCount=1', () => {
    const patchTarget = makeNode({
      id: 'some_node',
      compromised: true,
      sentinelPatched: false,
      layer: 1,
    });
    const state = makeState({
      turnCount: 1,
      sentinel: {
        active: true,
        sentinelInterval: 1,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: false,
      },
      network: {
        currentNodeId: patchTarget.id,
        previousNodeId: null,
        nodes: { [patchTarget.id]: patchTarget },
      },
    });

    const { lines } = runSentinelTurn(state);

    // Sentinel should have acted — lines will be non-empty (patch action produces lines)
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should skip acting when sentinelInterval=3 and turnCount=1 (not divisible)', () => {
    const patchTarget = makeNode({
      id: 'some_node',
      compromised: true,
      sentinelPatched: false,
      layer: 1,
    });
    const state = makeState({
      turnCount: 1,
      sentinel: {
        active: true,
        sentinelInterval: 3,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: false,
      },
      network: {
        currentNodeId: patchTarget.id,
        previousNodeId: null,
        nodes: { [patchTarget.id]: patchTarget },
      },
    });

    const { lines } = runSentinelTurn(state);

    // turnCount 1 % 3 !== 0, so sentinel must not act
    expect(lines).toHaveLength(0);
  });

  it('should act when sentinelInterval=3 and turnCount=3 (divisible)', () => {
    const patchTarget = makeNode({
      id: 'some_node',
      compromised: true,
      sentinelPatched: false,
      layer: 1,
    });
    const state = makeState({
      turnCount: 3,
      sentinel: {
        active: true,
        sentinelInterval: 3,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: false,
      },
      network: {
        currentNodeId: patchTarget.id,
        previousNodeId: null,
        nodes: { [patchTarget.id]: patchTarget },
      },
    });

    const { lines } = runSentinelTurn(state);

    // turnCount 3 % 3 === 0, so sentinel must act
    expect(lines.length).toBeGreaterThan(0);
  });
});
