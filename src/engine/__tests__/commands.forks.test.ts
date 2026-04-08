import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import type { GameState, GameFile, LiveNode } from '../../types/game';
import { makeState, makeNode } from './testHelpers';

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
    locked: true,
  });

const makeExecLegalNode = (overrides: Partial<LiveNode> = {}): LiveNode =>
  makeNode({
    id: 'exec_legal',
    ip: '10.4.0.2',
    label: 'EXEC LEGAL',
    layer: 3,
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

    expect(result.nextState?.flags['COMPLAINT_READ']).toBe(true);
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
    expect(result.nextState?.flags['COMPLAINT_READ']).toBe(true);
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
    expect(result.nextState?.player.trace ?? 0).toBeGreaterThanOrEqual(25);
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

    expect(result.nextState?.flags['COMPLAINT_READ']).toBeFalsy();
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

    expect(result.nextState?.forks['fork_ops_hr_db']).toBe('path_a');
  });

  it('should NOT set WHISTLEBLOWER_FOUND on path A', async () => {
    const state = makeHrDbState();

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    expect(result.nextState?.flags['WHISTLEBLOWER_FOUND']).toBeFalsy();
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

    const wb = result.nextState?.network.nodes['whistleblower_workstation'];
    expect(wb?.discovered).toBe(false);
  });

  it('should add the roster file to player.exfiltrated on path A', async () => {
    const state = makeHrDbState();

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const exfiltrated = result.nextState?.player.exfiltrated ?? [];
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

    expect(result.nextState?.forks['fork_ops_hr_db']).toBe('path_b');
  });

  it('should set flags.WHISTLEBLOWER_FOUND on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    expect(result.nextState?.flags['WHISTLEBLOWER_FOUND']).toBe(true);
  });

  it('should add +25 trace penalty on path B', async () => {
    const state = makeHrDbState({
      flags: { COMPLAINT_READ: true },
      player: { ...makeState().player, trace: 0 },
    });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    // Path B adds the base +3 exfil plus an extra +25 investigation penalty.
    expect(result.nextState?.player.trace ?? 0).toBeGreaterThanOrEqual(28);
  });

  it('should mark whistleblower_workstation as discovered on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const wb = result.nextState?.network.nodes['whistleblower_workstation'];
    expect(wb?.discovered).toBe(true);
  });

  it('should unlock (clear locked flag on) whistleblower_workstation on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const wb = result.nextState?.network.nodes['whistleblower_workstation'];
    // locked should be false (cleared) after path B
    expect(wb?.locked).toBe(false);
  });

  it('should add whistleblower_workstation to ops_hr_db.connections on path B', async () => {
    const state = makeHrDbState({ flags: { COMPLAINT_READ: true } });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    const hrNode = result.nextState?.network.nodes['ops_hr_db'];
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

    const exfiltrated = result.nextState?.player.exfiltrated ?? [];
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

    const hrConnections = result.nextState?.network.nodes['ops_hr_db']?.connections ?? [];
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
    expect(result.nextState?.forks['fork_ops_hr_db']).toBe('path_a');
    // No WHISTLEBLOWER_FOUND since fork was already resolved before this exfil.
    expect(result.nextState?.flags['WHISTLEBLOWER_FOUND']).toBeFalsy();
  });

  it('should NOT re-resolve the fork when fork_ops_hr_db is already "path_b"', async () => {
    const state = makeHrDbState({
      flags: { COMPLAINT_READ: true, WHISTLEBLOWER_FOUND: true },
      forks: { fork_ops_hr_db: 'path_b' },
    });

    const result = await resolveCommand('exfil /var/db/hr/employee_roster.csv', state);

    // Re-exfil is blocked by the already-exfiltrated idempotency guard before
    // even reaching the fork block. The fork should remain path_b.
    expect(result.nextState?.forks['fork_ops_hr_db']).toBe('path_b');
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

    expect(result.nextState?.flags['WHISTLEBLOWER_FOUND']).toBeFalsy();
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

    const errLine = result.lines.find(l => l.type === 'error');
    expect(errLine).toBeDefined();
    expect(errLine!.content.toLowerCase()).toContain('encrypted');
  });

  it('should return an error line mentioning "investigation" when WHISTLEBLOWER_FOUND is not set', async () => {
    const state = makeExecLegalState();

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    const errLine = result.lines.find(l => l.type === 'error');
    expect(errLine!.content.toLowerCase()).toContain('investigation');
  });

  it('should NOT set BOARD_KNEW when the gate blocks the read', async () => {
    const state = makeExecLegalState();

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(result.nextState?.flags['BOARD_KNEW']).toBeFalsy();
  });

  it('should NOT set fork_exec_legal when the gate blocks the read', async () => {
    const state = makeExecLegalState();

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(result.nextState?.forks['fork_exec_legal']).toBeUndefined();
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

    expect(result.nextState?.flags['BOARD_KNEW']).toBe(true);
  });

  it('should set forks.fork_exec_legal to "path_b" when WHISTLEBLOWER_FOUND is set', async () => {
    const state = makeExecLegalState({ flags: { WHISTLEBLOWER_FOUND: true } });

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    expect(result.nextState?.forks['fork_exec_legal']).toBe('path_b');
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

    expect(result.nextState?.player.trace ?? 0).toBeGreaterThanOrEqual(25);
  });

  it('should NOT set BOARD_KNEW a second time if it was already true', async () => {
    const state = makeExecLegalState({
      flags: { WHISTLEBLOWER_FOUND: true, BOARD_KNEW: true },
      forks: { fork_exec_legal: 'path_b' },
    });

    const result = await resolveCommand('cat /legal/aria/ARIA_BOARD_DISCLOSURE', state);

    // Flag stays true — no toggle.
    expect(result.nextState?.flags['BOARD_KNEW']).toBe(true);
    // Fork stays path_b.
    expect(result.nextState?.forks['fork_exec_legal']).toBe('path_b');
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

    expect(result.nextState?.flags['BOARD_KNEW']).toBe(true);
    expect(result.nextState?.forks['fork_exec_legal']).toBe('path_b');
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

    const errLine = result.lines.find(l => l.type === 'error');
    expect(errLine).toBeDefined();
    expect(errLine!.content.toLowerCase()).toContain('encrypted');
    expect(result.nextState?.flags['BOARD_KNEW']).toBeFalsy();
  });
});
