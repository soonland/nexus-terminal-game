import { describe, it, expect } from 'vitest';
import { buildCredentialChains } from './buildCredentialChains';
import { generateEmployeePool } from './generateEmployeePool';
import { generateFillerNodes } from './generateFillerNodes';
import { buildNodeMap } from '../data/anchorNodes';
import { DIVISION_SEEDS } from '../data/divisionSeeds';
import type { LiveNode } from '../types/game';

// ── Shared fixtures ─────────────────────────────────────────

const anchorNodes = buildNodeMap();
const { fillerNodes } = generateFillerNodes(42, anchorNodes);
const { employees, employeeCredentials } = generateEmployeePool(42, fillerNodes);

// Division → layer mapping (mirrors the module under test)
const DIVISION_LAYER: Record<string, number> = {
  external_perimeter: 0,
  operations: 1,
  security: 2,
  finance: 3,
  executive: 4,
};

// ── Determinism ─────────────────────────────────────────────

describe('buildCredentialChains — determinism', () => {
  it('same seed produces identical filePatch', () => {
    const r1 = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);
    const r2 = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);
    expect(r1.filePatch).toEqual(r2.filePatch);
  });

  it('same seed produces identical connectionPatch', () => {
    const r1 = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);
    const r2 = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);
    expect(r1.connectionPatch).toEqual(r2.connectionPatch);
  });

  it('same seed produces identical credentialHintPatch', () => {
    const r1 = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);
    const r2 = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);
    expect(r1.credentialHintPatch).toEqual(r2.credentialHintPatch);
  });

  it('different seeds produce different file contents in filePatch', () => {
    const r1 = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);
    const r2 = buildCredentialChains(999, employees, employeeCredentials, fillerNodes);

    // Collect all file content strings from both runs
    const allContent1 = Object.values(r1.filePatch)
      .flat()
      .map(f => f.content)
      .join('\n');
    const allContent2 = Object.values(r2.filePatch)
      .flat()
      .map(f => f.content)
      .join('\n');

    expect(allContent1).not.toBe(allContent2);
  });
});

// ── Return shape ────────────────────────────────────────────

describe('buildCredentialChains — return shape', () => {
  const { filePatch, connectionPatch, credentialHintPatch } = buildCredentialChains(
    42,
    employees,
    employeeCredentials,
    fillerNodes,
  );

  it('returns a filePatch object', () => {
    expect(typeof filePatch).toBe('object');
    expect(filePatch).not.toBeNull();
  });

  it('returns a connectionPatch object', () => {
    expect(typeof connectionPatch).toBe('object');
    expect(connectionPatch).not.toBeNull();
  });

  it('returns a credentialHintPatch object', () => {
    expect(typeof credentialHintPatch).toBe('object');
    expect(credentialHintPatch).not.toBeNull();
  });

  it('filePatch keys are valid filler node IDs', () => {
    const fillerIds = new Set(fillerNodes.map(n => n.id));
    for (const nodeId of Object.keys(filePatch)) {
      expect(fillerIds.has(nodeId)).toBe(true);
    }
  });

  it('connectionPatch keys are valid filler node IDs', () => {
    const fillerIds = new Set(fillerNodes.map(n => n.id));
    for (const nodeId of Object.keys(connectionPatch)) {
      expect(fillerIds.has(nodeId)).toBe(true);
    }
  });

  it('credentialHintPatch keys are valid filler node IDs', () => {
    const fillerIds = new Set(fillerNodes.map(n => n.id));
    for (const nodeId of Object.keys(credentialHintPatch)) {
      expect(fillerIds.has(nodeId)).toBe(true);
    }
  });
});

// ── Chain structure — file types and naming ─────────────────

describe('buildCredentialChains — chain structure', () => {
  const { filePatch } = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);

  // Build a flat list of all files planted along chains, together with their
  // originating node ID, so we can verify naming conventions per step.
  const allPlantedFiles = Object.entries(filePatch).flatMap(([nodeId, files]) =>
    files.map(f => ({ nodeId, file: f })),
  );

  it('plants at least one file overall (chains exist)', () => {
    expect(allPlantedFiles.length).toBeGreaterThan(0);
  });

  it('every INT_MEMO file has type "email"', () => {
    const memoFiles = allPlantedFiles.filter(({ file }) => file.name.startsWith('INT_MEMO_'));
    expect(memoFiles.length).toBeGreaterThan(0);
    for (const { file } of memoFiles) {
      expect(file.type).toBe('email');
    }
  });

  it('every INT_MEMO file has accessRequired "none"', () => {
    const memoFiles = allPlantedFiles.filter(({ file }) => file.name.startsWith('INT_MEMO_'));
    for (const { file } of memoFiles) {
      expect(file.accessRequired).toBe('none');
    }
  });

  it('every INT_MEMO file has exfiltrable: false', () => {
    const memoFiles = allPlantedFiles.filter(({ file }) => file.name.startsWith('INT_MEMO_'));
    for (const { file } of memoFiles) {
      expect(file.exfiltrable).toBe(false);
    }
  });

  it('INT_MEMO file names match INT_MEMO_XX.TXT pattern', () => {
    const memoFiles = allPlantedFiles.filter(({ file }) => file.name.startsWith('INT_MEMO_'));
    const MEMO_NAME_RE = /^INT_MEMO_\d{2}\.TXT$/;
    for (const { file } of memoFiles) {
      expect(file.name).toMatch(MEMO_NAME_RE);
    }
  });

  it('every IT_CREDS file has type "credential"', () => {
    const credFiles = allPlantedFiles.filter(({ file }) => file.name.startsWith('IT_CREDS_'));
    expect(credFiles.length).toBeGreaterThan(0);
    for (const { file } of credFiles) {
      expect(file.type).toBe('credential');
    }
  });

  it('every IT_CREDS file has accessRequired "user"', () => {
    const credFiles = allPlantedFiles.filter(({ file }) => file.name.startsWith('IT_CREDS_'));
    for (const { file } of credFiles) {
      expect(file.accessRequired).toBe('user');
    }
  });

  it('every IT_CREDS file has exfiltrable: true', () => {
    const credFiles = allPlantedFiles.filter(({ file }) => file.name.startsWith('IT_CREDS_'));
    for (const { file } of credFiles) {
      expect(file.exfiltrable).toBe(true);
    }
  });

  it('IT_CREDS file names match IT_CREDS_XX.TXT pattern', () => {
    const credFiles = allPlantedFiles.filter(({ file }) => file.name.startsWith('IT_CREDS_'));
    const CRED_NAME_RE = /^IT_CREDS_\d{2}\.TXT$/;
    for (const { file } of credFiles) {
      expect(file.name).toMatch(CRED_NAME_RE);
    }
  });

  it('only INT_MEMO and IT_CREDS file names appear in filePatch', () => {
    for (const { file } of allPlantedFiles) {
      const isKnown = file.name.startsWith('INT_MEMO_') || file.name.startsWith('IT_CREDS_');
      expect(isKnown).toBe(true);
    }
  });
});

// ── Reference file content ──────────────────────────────────

describe('buildCredentialChains — reference file content', () => {
  // To verify reference file content we need to reconstruct which employees
  // are linked to which nodes. We do this by inspecting the planted files
  // directly — a reference file must name a real employee.
  const { filePatch } = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);

  const empByUsername = new Map(employees.map(e => [e.username, e]));
  const nodeById = new Map(fillerNodes.map(n => [n.id, n]));

  it('every INT_MEMO content references a real employee first+last name', () => {
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('INT_MEMO_')) continue;
        // Content must contain firstName + lastName of some real employee
        const content = file.content ?? '';
        const matchedEmployee = employees.find(
          e => content.includes(e.firstName) && content.includes(e.lastName),
        );
        expect(matchedEmployee).toBeDefined();
      }
    }
  });

  it('every INT_MEMO content references a real employee username', () => {
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('INT_MEMO_')) continue;
        // Extract the username from the parenthetical (username) in the content
        const match = file.content?.match(/\(([^)]+)\)/);
        expect(match).not.toBeNull();
        const username = match![1];
        expect(empByUsername.has(username)).toBe(true);
      }
    }
  });

  it('every INT_MEMO content references the IP address of a real filler node', () => {
    const fillerIps = new Set(fillerNodes.map(n => n.ip));
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('INT_MEMO_')) continue;
        // Find an IP address in the content
        const ipMatch = file.content?.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
        expect(ipMatch).not.toBeNull();
        expect(fillerIps.has(ipMatch![1])).toBe(true);
      }
    }
  });

  it('INT_MEMO content IP belongs to the employee workstation referenced in the memo', () => {
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('INT_MEMO_')) continue;
        const usernameMatch = file.content?.match(/\(([^)]+)\)/);
        const ipMatch = file.content?.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
        if (!usernameMatch || !ipMatch) continue;

        const emp = empByUsername.get(usernameMatch[1]);
        expect(emp).toBeDefined();
        const wsNode = nodeById.get(emp!.workstationId);
        expect(wsNode).toBeDefined();
        expect(wsNode!.ip).toBe(ipMatch[1]);
      }
    }
  });

  it('INT_MEMO content includes the IronGate sender/receiver header', () => {
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('INT_MEMO_')) continue;
        expect(file.content).toContain('it-helpdesk@irongate.corp');
        expect(file.content).toContain('staff@irongate.corp');
      }
    }
  });
});

// ── Credential file content ─────────────────────────────────

describe('buildCredentialChains — credential file content', () => {
  const { filePatch } = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);

  const credByUsername = new Map(employeeCredentials.map(c => [c.username, c]));

  it('every IT_CREDS content references a real employee username', () => {
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('IT_CREDS_')) continue;
        const userMatch = file.content?.match(/^User: (.+)$/m);
        expect(userMatch).not.toBeNull();
        const username = userMatch![1];
        expect(credByUsername.has(username)).toBe(true);
      }
    }
  });

  it('every IT_CREDS content references the correct password for the username', () => {
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('IT_CREDS_')) continue;
        const userMatch = file.content?.match(/^User: (.+)$/m);
        const passMatch = file.content?.match(/^Pass: (.+)$/m);
        expect(userMatch).not.toBeNull();
        expect(passMatch).not.toBeNull();

        const cred = credByUsername.get(userMatch![1]);
        expect(cred).toBeDefined();
        expect(passMatch![1]).toBe(cred!.password);
      }
    }
  });

  it('IT_CREDS content includes the IronGate IT Support footer', () => {
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('IT_CREDS_')) continue;
        expect(file.content).toContain('-- IronGate IT Support');
      }
    }
  });

  it('IT_CREDS content includes a System field referencing a valid filler node ID', () => {
    const fillerIds = new Set(fillerNodes.map(n => n.id));
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('IT_CREDS_')) continue;
        const sysMatch = file.content?.match(/^System: (.+)$/m);
        expect(sysMatch).not.toBeNull();
        expect(fillerIds.has(sysMatch![1])).toBe(true);
      }
    }
  });
});

// ── Chain connections ───────────────────────────────────────

describe('buildCredentialChains — connectionPatch bidirectionality', () => {
  const { connectionPatch } = buildCredentialChains(
    42,
    employees,
    employeeCredentials,
    fillerNodes,
  );

  it('connectionPatch values are arrays of filler node IDs', () => {
    const fillerIds = new Set(fillerNodes.map(n => n.id));
    for (const [, targets] of Object.entries(connectionPatch)) {
      expect(Array.isArray(targets)).toBe(true);
      for (const targetId of targets) {
        expect(fillerIds.has(targetId)).toBe(true);
      }
    }
  });

  it('every connection added is bidirectional within the patch', () => {
    // For every A→B in patch, either B→A is also in patch or B already
    // connects to A in the original fillerNodes.
    const nodeById = new Map(fillerNodes.map(n => [n.id, n]));

    for (const [fromId, targets] of Object.entries(connectionPatch)) {
      for (const toId of targets) {
        const toNode = nodeById.get(toId)!;
        const reverseInPatch = (connectionPatch[toId] ?? []).includes(fromId);
        const reverseInOriginal = toNode.connections.includes(fromId);
        expect(reverseInPatch || reverseInOriginal).toBe(true);
      }
    }
  });

  it('connectionPatch nodes are in the same division layer as each other', () => {
    const nodeById = new Map(fillerNodes.map(n => [n.id, n]));
    for (const [fromId, targets] of Object.entries(connectionPatch)) {
      const fromNode = nodeById.get(fromId)!;
      for (const toId of targets) {
        const toNode = nodeById.get(toId)!;
        expect(fromNode.layer).toBe(toNode.layer);
      }
    }
  });
});

// ── No duplicate connections ─────────────────────────────────

describe('buildCredentialChains — no duplicate connections', () => {
  const { connectionPatch } = buildCredentialChains(
    42,
    employees,
    employeeCredentials,
    fillerNodes,
  );
  const nodeById = new Map(fillerNodes.map(n => [n.id, n]));

  it('connectionPatch does not add connections that already exist in the source node', () => {
    for (const [nodeId, newConns] of Object.entries(connectionPatch)) {
      const node = nodeById.get(nodeId)!;
      for (const connId of newConns) {
        expect(node.connections.includes(connId)).toBe(false);
      }
    }
  });

  it('connectionPatch does not contain duplicates within a single node entry', () => {
    for (const [, targets] of Object.entries(connectionPatch)) {
      const unique = new Set(targets);
      expect(unique.size).toBe(targets.length);
    }
  });
});

// ── credentialHintPatch — cross-node hints ──────────────────

describe('buildCredentialChains — credentialHintPatch', () => {
  const { filePatch, credentialHintPatch } = buildCredentialChains(
    42,
    employees,
    employeeCredentials,
    fillerNodes,
  );

  const credIdSet = new Set(employeeCredentials.map(c => c.id));

  it('all credential IDs in credentialHintPatch exist in the credential list', () => {
    for (const credIds of Object.values(credentialHintPatch)) {
      for (const credId of credIds) {
        expect(credIdSet.has(credId)).toBe(true);
      }
    }
  });

  it('every node with a credential hint also has an IT_CREDS file planted', () => {
    for (const nodeId of Object.keys(credentialHintPatch)) {
      const planted = (filePatch[nodeId] ?? []).some(f => f.name.startsWith('IT_CREDS_'));
      expect(planted).toBe(true);
    }
  });

  it('the credential IDs in credentialHintPatch do NOT belong to the employees assigned to that node', () => {
    // For each hinted node, collect the employee IDs whose workstation IS that node.
    // The hinted credential must belong to a DIFFERENT employee (the next in the chain).
    const empsByWorkstation = new Map<string, string[]>();
    for (const emp of employees) {
      if (!emp.workstationId) continue;
      const list = empsByWorkstation.get(emp.workstationId) ?? [];
      list.push(emp.id);
      empsByWorkstation.set(emp.workstationId, list);
    }

    const credSourceById = new Map(employeeCredentials.map(c => [c.id, c.source]));

    for (const [nodeId, credIds] of Object.entries(credentialHintPatch)) {
      const ownEmpIds = new Set(empsByWorkstation.get(nodeId) ?? []);
      for (const credId of credIds) {
        const sourceEmpId = credSourceById.get(credId);
        // The credential source employee must NOT be one assigned to this node
        expect(ownEmpIds.has(sourceEmpId!)).toBe(false);
      }
    }
  });

  it('no duplicate credential IDs within a single credentialHintPatch node entry', () => {
    for (const credIds of Object.values(credentialHintPatch)) {
      const unique = new Set(credIds);
      expect(unique.size).toBe(credIds.length);
    }
  });
});

// ── Chain length constraint ──────────────────────────────────

describe('buildCredentialChains — chain length', () => {
  // Derive chain length per division by counting the chain nodes that appear
  // in filePatch. Each chain step plants one file on the current node, so a
  // chain of length L plants files on nodes 0..L-2 (i.e. L-1 nodes).
  //
  // Chain length is capped at min(distinctWorkstationIds, 5), so with at
  // least 2 distinct nodes the minimum is 2, and files are planted on 1–4 nodes.
  //
  // We identify division membership via the node ID prefix (e.g. "ops-ws-01").
  // We mirror the module's eligibility check: count distinct filler-node IDs
  // that have at least one employee assigned AND whose layer matches the division.
  const DIV_PREFIX: Record<string, string> = {
    external_perimeter: 'ext',
    operations: 'ops',
    security: 'sec',
    finance: 'fin',
    executive: 'exec',
  };

  const { filePatch } = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);
  const nodeById = new Map(fillerNodes.map(n => [n.id, n]));

  for (const division of DIVISION_SEEDS) {
    const prefix = DIV_PREFIX[division.divisionId];
    const layer = DIVISION_LAYER[division.divisionId];

    // Mirror the module's grouping logic: only count workstation IDs whose
    // assigned employees exist AND whose node layer matches this division.
    const empsByWorkstation = new Map<string, string[]>();
    for (const emp of employees) {
      if (emp.divisionId !== division.divisionId || emp.workstationId === '') continue;
      const node = nodeById.get(emp.workstationId);
      if (!node || node.layer !== layer) continue;
      const list = empsByWorkstation.get(emp.workstationId) ?? [];
      list.push(emp.id);
      empsByWorkstation.set(emp.workstationId, list);
    }
    const distinctWorkstationCount = empsByWorkstation.size;

    const chainNodes = Object.keys(filePatch).filter(nodeId => nodeId.startsWith(`${prefix}-`));

    if (distinctWorkstationCount < 2) {
      it(`${division.divisionId}: produces no chain file nodes when < 2 distinct employee workstations`, () => {
        expect(chainNodes.length).toBe(0);
      });
    } else {
      it(`${division.divisionId}: chain plants files on 1–4 nodes (chain length 2–5, last node gets no file)`, () => {
        // A chain of length L (capped at min(distinct, 5)) plants files on L-1 nodes.
        // min distinct is 2 → min files nodes = 1; max chain = 5 → max file nodes = 4.
        expect(chainNodes.length).toBeGreaterThanOrEqual(1);
        expect(chainNodes.length).toBeLessThanOrEqual(4);
      });
    }
  }
});

// ── Graceful skip — divisions with < 2 workstation nodes ────

describe('buildCredentialChains — graceful skip for thin divisions', () => {
  it('returns empty patches when all filler nodes are in only one workstation per division', () => {
    // Build a degenerate fillerNodes set with exactly one workstation per division
    const onePerDiv: LiveNode[] = DIVISION_SEEDS.map((div, i) => ({
      id: `${['ext', 'ops', 'sec', 'fin', 'exec'][i]}-ws-01`,
      ip: `10.${String(i)}.0.10`,
      template: 'workstation' as const,
      label: 'WORKSTATION [Win]',
      description: null,
      layer: DIVISION_LAYER[div.divisionId],
      anchor: false,
      connections: [],
      services: [],
      files: [],
      accessLevel: 'none' as const,
      compromised: false,
      discovered: false,
      credentialHints: [],
    }));

    // Assign one employee to the single workstation per division
    const thinEmployees = employees.map(e => ({
      ...e,
      workstationId: onePerDiv.find(n => n.layer === DIVISION_LAYER[e.divisionId])?.id ?? '',
    }));

    const { filePatch, connectionPatch, credentialHintPatch } = buildCredentialChains(
      42,
      thinEmployees,
      employeeCredentials,
      onePerDiv,
    );

    expect(Object.keys(filePatch)).toHaveLength(0);
    expect(Object.keys(connectionPatch)).toHaveLength(0);
    expect(Object.keys(credentialHintPatch)).toHaveLength(0);
  });
});

// ── Empty fillerNodes ────────────────────────────────────────

describe('buildCredentialChains — empty fillerNodes', () => {
  it('returns empty patch maps when fillerNodes is empty', () => {
    const emptyEmployees = employees.map(e => ({ ...e, workstationId: '' }));
    const { filePatch, connectionPatch, credentialHintPatch } = buildCredentialChains(
      42,
      emptyEmployees,
      employeeCredentials,
      [],
    );

    expect(Object.keys(filePatch)).toHaveLength(0);
    expect(Object.keys(connectionPatch)).toHaveLength(0);
    expect(Object.keys(credentialHintPatch)).toHaveLength(0);
  });

  it('returns empty patch maps when employees have no workstationIds', () => {
    const noWsEmployees = employees.map(e => ({ ...e, workstationId: '' }));
    const { filePatch, connectionPatch, credentialHintPatch } = buildCredentialChains(
      42,
      noWsEmployees,
      employeeCredentials,
      fillerNodes,
    );

    expect(Object.keys(filePatch)).toHaveLength(0);
    expect(Object.keys(connectionPatch)).toHaveLength(0);
    expect(Object.keys(credentialHintPatch)).toHaveLength(0);
  });
});

// ── File path format ─────────────────────────────────────────

describe('buildCredentialChains — file path format', () => {
  const { filePatch } = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);

  it('INT_MEMO files have path /documents/INT_MEMO_XX.TXT', () => {
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('INT_MEMO_')) continue;
        expect(file.path).toBe(`/documents/${file.name}`);
      }
    }
  });

  it('IT_CREDS files have path /documents/IT_CREDS_XX.TXT', () => {
    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('IT_CREDS_')) continue;
        expect(file.path).toBe(`/documents/${file.name}`);
      }
    }
  });
});

// ── Even/odd step assignment ─────────────────────────────────

describe('buildCredentialChains — even/odd step file assignment', () => {
  const { filePatch } = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);

  // Derive the step index from the numeric suffix in the file name.
  // File suffix is (stepIndex + 1), so stepIndex = parseInt(suffix) - 1.
  it('suffix 01 files (step 0, even) are always type "email"', () => {
    const step0Files = Object.values(filePatch)
      .flat()
      .filter(f => f.name.endsWith('_01.TXT'));
    expect(step0Files.length).toBeGreaterThan(0);
    for (const f of step0Files) {
      expect(f.type).toBe('email');
    }
  });

  it('suffix 02 files (step 1, odd) are always type "credential"', () => {
    const step1Files = Object.values(filePatch)
      .flat()
      .filter(f => f.name.endsWith('_02.TXT'));
    // Only present when chains are longer than 2; may not always exist with seed 42,
    // so guard the loop
    for (const f of step1Files) {
      expect(f.type).toBe('credential');
    }
  });

  it('suffix 03 files (step 2, even) are always type "email"', () => {
    const step2Files = Object.values(filePatch)
      .flat()
      .filter(f => f.name.endsWith('_03.TXT'));
    for (const f of step2Files) {
      expect(f.type).toBe('email');
    }
  });

  it('suffix 04 files (step 3, odd) are always type "credential"', () => {
    const step3Files = Object.values(filePatch)
      .flat()
      .filter(f => f.name.endsWith('_04.TXT'));
    for (const f of step3Files) {
      expect(f.type).toBe('credential');
    }
  });
});

// ── Layer guard — employees in wrong layer are ignored ───────

describe('buildCredentialChains — layer guard', () => {
  it('employees whose workstation layer does not match their division layer are excluded from chains', () => {
    // Move all ext employees onto a security (layer 2) node to break the layer constraint
    const secNode = fillerNodes.find(n => n.layer === 2 && n.template === 'workstation');
    if (!secNode) return; // Guard: skip if no security workstation generated

    const tamperedEmployees = employees.map(e =>
      e.divisionId === 'external_perimeter' ? { ...e, workstationId: secNode.id } : e,
    );

    // The result should not crash and ext employees should not contribute to chains
    // (they will be filtered out because layer 2 node ≠ layer 0 for external_perimeter)
    const { filePatch } = buildCredentialChains(
      42,
      tamperedEmployees,
      employeeCredentials,
      fillerNodes,
    );

    // The ext prefix should not appear in filePatch keys
    const extKeys = Object.keys(filePatch).filter(k => k.startsWith('ext-'));
    expect(extKeys).toHaveLength(0);
  });
});

// ── Missing credentials are handled gracefully ───────────────

describe('buildCredentialChains — missing credentials', () => {
  it('does not crash when an employee has no matching credential', () => {
    // Remove all credentials — odd-index steps should be skipped silently
    expect(() => buildCredentialChains(42, employees, [], fillerNodes)).not.toThrow();
  });

  it('produces no IT_CREDS files when credentials list is empty', () => {
    const { filePatch } = buildCredentialChains(42, employees, [], fillerNodes);
    const credFiles = Object.values(filePatch)
      .flat()
      .filter(f => f.name.startsWith('IT_CREDS_'));
    expect(credFiles).toHaveLength(0);
  });

  it('still produces INT_MEMO files even when credentials list is empty', () => {
    const { filePatch } = buildCredentialChains(42, employees, [], fillerNodes);
    const memoFiles = Object.values(filePatch)
      .flat()
      .filter(f => f.name.startsWith('INT_MEMO_'));
    expect(memoFiles.length).toBeGreaterThan(0);
  });

  it('produces no credentialHintPatch entries when credentials list is empty', () => {
    const { credentialHintPatch } = buildCredentialChains(42, employees, [], fillerNodes);
    expect(Object.keys(credentialHintPatch)).toHaveLength(0);
  });
});

// ── Layer guard — unknown node IDs are skipped ───────────────

describe('buildCredentialChains — unknown workstation node IDs', () => {
  it('does not crash and ignores employees whose workstationId does not exist in fillerNodes', () => {
    // Assign all employees to a completely fictitious node ID
    const unknownIdEmployees = employees.map(e => ({ ...e, workstationId: 'totally-unknown-999' }));

    expect(() =>
      buildCredentialChains(42, unknownIdEmployees, employeeCredentials, fillerNodes),
    ).not.toThrow();
  });

  it('produces empty patch maps when all workstationIds reference unknown nodes', () => {
    const unknownIdEmployees = employees.map(e => ({ ...e, workstationId: 'totally-unknown-999' }));
    const { filePatch, connectionPatch, credentialHintPatch } = buildCredentialChains(
      42,
      unknownIdEmployees,
      employeeCredentials,
      fillerNodes,
    );

    expect(Object.keys(filePatch)).toHaveLength(0);
    expect(Object.keys(connectionPatch)).toHaveLength(0);
    expect(Object.keys(credentialHintPatch)).toHaveLength(0);
  });
});

// ── IT_CREDS content references employee workstationId ───────

describe('buildCredentialChains — IT_CREDS System field matches next employee workstation', () => {
  const { filePatch } = buildCredentialChains(42, employees, employeeCredentials, fillerNodes);

  it('System field in IT_CREDS matches the workstationId of the employee whose credentials are revealed', () => {
    const credByUsername = new Map(employeeCredentials.map(c => [c.username, c]));
    const empByEmpId = new Map(employees.map(e => [e.id, e]));

    for (const files of Object.values(filePatch)) {
      for (const file of files) {
        if (!file.name.startsWith('IT_CREDS_')) continue;

        const userMatch = file.content?.match(/^User: (.+)$/m);
        const sysMatch = file.content?.match(/^System: (.+)$/m);
        if (!userMatch || !sysMatch) continue;

        const cred = credByUsername.get(userMatch[1]);
        expect(cred).toBeDefined();

        const source = cred?.source ?? '';
        const emp = empByEmpId.get(source);
        expect(emp).toBeDefined();
        expect(sysMatch[1]).toBe(emp?.workstationId);
      }
    }
  });
});
