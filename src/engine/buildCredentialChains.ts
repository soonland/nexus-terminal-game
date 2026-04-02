import type { LiveNode, GameFile, Credential } from '../types/game';
import type { Employee } from '../types/employee';
import type { DivisionId } from '../types/divisionSeed';
import { DIVISION_SEEDS } from '../data/divisionSeeds';
import { createPRNG } from './prng';

// ── Division → layer mapping (mirrors generateFillerNodes) ──
// Exported so test files can import rather than duplicate it.
export const DIVISION_LAYER: Record<DivisionId, number> = {
  external_perimeter: 0,
  operations: 1,
  security: 2,
  finance: 3,
  executive: 4,
};

// ── Public result type ──────────────────────────────────────

interface CredentialChainResult {
  /** Map of nodeId → GameFile[] to append to the node's file list. */
  filePatch: Record<string, GameFile[]>;
  /** Map of nodeId → nodeId[] to add to the node's connections. */
  connectionPatch: Record<string, string[]>;
  /** Map of nodeId → credentialId[] to add to the node's credentialHints. */
  credentialHintPatch: Record<string, string[]>;
}

// ── File builders ───────────────────────────────────────────

/**
 * Plant a reference file on the current chain node that names the next employee
 * and their approximate location (IP address of their workstation).
 * Placed on even-index chain steps (0, 2, 4 …).
 */
const buildReferenceFile = (nextEmp: Employee, nextNodeIp: string, stepIndex: number): GameFile => {
  const suffix = String(stepIndex + 1).padStart(2, '0');
  return {
    name: `INT_MEMO_${suffix}.TXT`,
    path: `/documents/INT_MEMO_${suffix}.TXT`,
    type: 'email',
    content: [
      'FROM: it-helpdesk@irongate.corp',
      'TO: staff@irongate.corp',
      'SUBJECT: Workstation Relocation Notice',
      '',
      `${nextEmp.firstName} ${nextEmp.lastName} (${nextEmp.username}) has been relocated.`,
      `New workstation: ${nextNodeIp}`,
      '',
      '-- IronGate IT Support',
    ].join('\n'),
    exfiltrable: false,
    accessRequired: 'user',
  };
};

/**
 * Plant a credential file on the current chain node that reveals the next
 * employee's login details. Placed on odd-index chain steps (1, 3 …).
 */
const buildCredentialFile = (
  nextCred: Credential,
  nextNodeIp: string,
  stepIndex: number,
): GameFile => {
  const suffix = String(stepIndex + 1).padStart(2, '0');
  return {
    name: `IT_CREDS_${suffix}.TXT`,
    path: `/documents/IT_CREDS_${suffix}.TXT`,
    type: 'credential',
    content: [
      'TEMPORARY CREDENTIALS NOTICE',
      '',
      `User: ${nextCred.username}`,
      `Pass: ${nextCred.password}`,
      `System: ${nextNodeIp}`,
      '',
      'Please update password upon next login.',
      '-- IronGate IT Support',
    ].join('\n'),
    exfiltrable: true,
    accessRequired: 'user',
  };
};

// ── Patch helpers ───────────────────────────────────────────

const appendPatch = <T>(record: Record<string, T[]>, key: string, values: T[]): void => {
  record[key] = [...(record[key] ?? []), ...values];
};

// ── Main generator ──────────────────────────────────────────

/**
 * Build lateral movement chains — one per division when sufficient workstation
 * nodes are available.
 *
 * A chain is a sequence of 3–5 distinct workstation-template filler nodes where:
 *   - Even-index steps plant a reference file naming the next employee + IP.
 *   - Odd-index steps plant a credential file revealing the next employee's login.
 *   - Every consecutive pair of chain nodes is directly connected (bidirectional).
 *
 * The last chain node is always adjacent to the division anchor because
 * buildConnectivity already links every filler node in a division layer to that
 * layer's anchor nodes — no extra work required here.
 *
 * Uses a dedicated PRNG constant (0xd1b54a33) with a non-zero base offset so that
 * divIndex=0 does not produce the same seed as the filler node (0x9e3779b9) or
 * employee pool (0xb7e15163) generators.
 */
export const buildCredentialChains = (
  sessionSeed: number,
  employees: Employee[],
  credentials: Credential[],
  fillerNodes: LiveNode[],
): CredentialChainResult => {
  const filePatch: Record<string, GameFile[]> = {};
  const connectionPatch: Record<string, string[]> = {};
  const credentialHintPatch: Record<string, string[]> = {};

  // Build quick lookups as plain objects so indexed access is typed as always-present,
  // matching the pattern used in createInitialState (nodes: Record<string, LiveNode>).
  // One credential per employee is an invariant maintained by generateEmployeePool;
  // if that ever changes, the object will silently keep only the last entry per source.
  const credByEmpId = Object.fromEntries(credentials.map(c => [c.source, c])) as Record<
    string,
    Credential
  >;
  const nodeById = Object.fromEntries(fillerNodes.map(n => [n.id, n])) as Record<string, LiveNode>;

  for (let divIndex = 0; divIndex < DIVISION_SEEDS.length; divIndex++) {
    const division = DIVISION_SEEDS[divIndex];
    const divId = division.divisionId;
    const layer = DIVISION_LAYER[divId];

    // Multiply by (divIndex + 1) so divIndex=0 produces 0xd1b54a33 (not 0), giving
    // every division a unique offset that always differs from the raw sessionSeed.
    // A leading `^ 0xd1b54a33` was previously present but cancelled the divIndex=0 term.
    const divSeed = (sessionSeed ^ ((divIndex + 1) * 0xd1b54a33)) >>> 0;
    const prng = createPRNG(divSeed);

    // Collect employees with workstations in this division's layer.
    const divEmps = employees.filter(e => e.divisionId === divId && e.workstationId !== '');

    // Group employees by their workstation node, keeping only workstation-template
    // nodes in this division's layer (guards against stale IDs and non-workstation nodes).
    const empsByWorkstation: Record<string, Employee[]> = {};
    for (const emp of divEmps) {
      const node = nodeById[emp.workstationId];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- workstationId may reference an anchor or non-filler node absent from nodeById
      if (!node || node.layer !== layer || node.template !== 'workstation') continue;
      empsByWorkstation[emp.workstationId] = [...(empsByWorkstation[emp.workstationId] ?? []), emp];
    }

    const distinctWorkstationIds = Object.keys(empsByWorkstation);

    // Need at least 3 distinct workstation nodes to form a valid chain (spec: 3–5 nodes).
    if (distinctWorkstationIds.length < 3) continue;

    // Shuffle node IDs deterministically.
    const shuffled = [...distinctWorkstationIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }

    // Chain length: 3–5 nodes.
    const chainLength = Math.min(shuffled.length, 5);
    const chainNodeIds = shuffled.slice(0, chainLength);

    // Pick one representative employee per chain node using the PRNG.
    // chainNodeIds contains only keys from empsByWorkstation — always defined.
    const chainEmployees = chainNodeIds.map(nId => {
      const emps = empsByWorkstation[nId];
      return emps[Math.floor(prng() * emps.length)];
    });

    // Plant files and ensure connections along the chain.
    for (let i = 0; i < chainLength - 1; i++) {
      const currentNodeId = chainNodeIds[i];
      const nextNodeId = chainNodeIds[i + 1];
      const nextEmp = chainEmployees[i + 1];
      // chainNodeIds contains only IDs filtered to exist in nodeById — always defined.
      const nextNode = nodeById[nextNodeId];

      if (i % 2 === 0) {
        // Even step: reference file pointing to the next employee's workstation.
        appendPatch(filePatch, currentNodeId, [buildReferenceFile(nextEmp, nextNode.ip, i)]);
      } else {
        // Odd step: credential file revealing the next employee's login details.
        const nextCred = credByEmpId[nextEmp.id];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- employee may lack a credential entry if the one-cred-per-employee invariant is broken
        if (nextCred) {
          appendPatch(filePatch, currentNodeId, [buildCredentialFile(nextCred, nextNode.ip, i)]);
          // Make the credential discoverable from this node (cross-node hint).
          appendPatch(credentialHintPatch, currentNodeId, [nextCred.id]);
        }
      }

      // Ensure direct bidirectional connection between current and next node.
      const currentNode = nodeById[currentNodeId];
      if (!currentNode.connections.includes(nextNodeId)) {
        appendPatch(connectionPatch, currentNodeId, [nextNodeId]);
      }
      // For the reverse direction, account for connections already added
      // earlier in this loop iteration (connectionPatch is accumulated).
      const nextPatchConns = connectionPatch[nextNodeId] ?? [];
      if (
        !nextNode.connections.includes(currentNodeId) &&
        !nextPatchConns.includes(currentNodeId)
      ) {
        appendPatch(connectionPatch, nextNodeId, [currentNodeId]);
      }
    }
  }

  return { filePatch, connectionPatch, credentialHintPatch };
};
