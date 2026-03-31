import type { LiveNode, Credential, AccessLevel } from '../types/game';
import type { Employee } from '../types/employee';
import type { DivisionId } from '../types/divisionSeed';
import { DIVISION_SEEDS } from '../data/divisionSeeds';
import {
  FIRST_NAMES,
  LAST_NAMES,
  ROLES_BY_DIVISION,
  TRAITS_BY_DIVISION,
  PASSWORD_WORDS,
} from '../data/employeeData';
import { createPRNG } from './prng';

// ── Helpers ─────────────────────────────────────────────────

const pick = <T>(prng: () => number, items: T[]): T => items[Math.floor(prng() * items.length)];

const paddedIndex = (n: number): string => String(n + 1).padStart(3, '0');

/** Build a unique username from firstname.lastname, appending a counter on collision. */
const buildUsername = (firstName: string, lastName: string, taken: Set<string>): string => {
  const base = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base}${String(counter)}`)) counter++;
  return `${base}${String(counter)}`;
};

/** Generate a plausible-looking employee password from the word list and PRNG. */
const buildPassword = (prng: () => number): string => {
  const word = pick(prng, PASSWORD_WORDS);
  const suffix = String(Math.floor(prng() * 900) + 100); // 100–999
  const separator = pick(prng, ['!', '@', '#', '_', '-', '.']);
  return `${word}${separator}${suffix}`;
};

// ── Division → layer mapping (mirrors generateFillerNodes) ──
const DIVISION_LAYER: Record<DivisionId, number> = {
  external_perimeter: 0,
  operations: 1,
  security: 2,
  finance: 3,
  executive: 4,
};

const DIV_PREFIX: Record<DivisionId, string> = {
  external_perimeter: 'ext',
  operations: 'ops',
  security: 'sec',
  finance: 'fin',
  executive: 'exec',
};

/** Access level derived from division credential pattern. */
const CREDENTIAL_ACCESS: Record<DivisionId, AccessLevel> = {
  external_perimeter: 'user',
  operations: 'user',
  security: 'admin',
  finance: 'user',
  executive: 'user',
};

// ── Public result type ──────────────────────────────────────

export interface EmployeePoolResult {
  employees: Employee[];
  employeeCredentials: Credential[];
  /** Map of filler node ID → credential IDs for employees assigned there. */
  credentialHintPatches: Record<string, string[]>;
}

// ── Main generator ──────────────────────────────────────────

export const generateEmployeePool = (
  sessionSeed: number,
  fillerNodes: LiveNode[],
): EmployeePoolResult => {
  const employees: Employee[] = [];
  const employeeCredentials: Credential[] = [];
  const credentialHintPatches: Record<string, string[]> = {};

  // Username uniqueness is global across all divisions.
  const takenUsernames = new Set<string>();

  for (let divIndex = 0; divIndex < DIVISION_SEEDS.length; divIndex++) {
    const division = DIVISION_SEEDS[divIndex];
    const divId = division.divisionId;
    const layer = DIVISION_LAYER[divId];
    const divPrefix = DIV_PREFIX[divId];

    // Per-division seed offset (different constant from filler node generator to avoid stream overlap).
    const divSeed = (sessionSeed ^ (divIndex * 0xb7e15163)) >>> 0;
    const prng = createPRNG(divSeed);

    // Filler nodes that belong to this division (identified by layer and non-anchor).
    const divFillerNodes = fillerNodes.filter(n => n.layer === layer && !n.anchor);

    // Prefer workstation nodes for workstation assignment; fall back to any filler node.
    const workstationNodes = divFillerNodes.filter(n => n.template === 'workstation');
    const assignableNodes = workstationNodes.length > 0 ? workstationNodes : divFillerNodes;

    const rolePool = ROLES_BY_DIVISION[divId];
    const traitPool = TRAITS_BY_DIVISION[divId];
    const accessLevel = CREDENTIAL_ACCESS[divId];

    for (let i = 0; i < division.headcount; i++) {
      const firstName = pick(prng, FIRST_NAMES);
      const lastName = pick(prng, LAST_NAMES);
      const role = pick(prng, rolePool);

      const username = buildUsername(firstName, lastName, takenUsernames);
      takenUsernames.add(username);

      const email = `${username}@irongate.corp`;

      // Assign workstation round-robin (fallback: empty string if no filler nodes at all).
      const workstationId =
        assignableNodes.length > 0 ? assignableNodes[i % assignableNodes.length].id : '';

      // Pick 1–2 traits using Fisher-Yates shuffle.
      const traitCount = prng() < 0.4 ? 1 : 2;
      const traitCopy = [...traitPool];
      for (let t = traitCopy.length - 1; t > 0; t--) {
        const j = Math.floor(prng() * (t + 1));
        const tmp = traitCopy[t];
        traitCopy[t] = traitCopy[j];
        traitCopy[j] = tmp;
      }
      const traits = traitCopy.slice(0, traitCount);

      const empId = `emp_${divPrefix}_${paddedIndex(i)}`;

      const employee: Employee = {
        id: empId,
        firstName,
        lastName,
        divisionId: divId,
        role,
        username,
        email,
        workstationId,
        traits,
      };

      // One credential per employee.
      const credId = `cred_${empId}`;
      const credential: Credential = {
        id: credId,
        username,
        password: buildPassword(prng),
        accessLevel,
        validOnNodes: workstationId ? [workstationId] : [],
        obtained: false,
        source: empId,
      };

      // Patch the workstation node's credentialHints.
      if (workstationId) {
        credentialHintPatches[workstationId] = [
          ...(credentialHintPatches[workstationId] ?? []),
          credId,
        ];
      }

      employees.push(employee);
      employeeCredentials.push(credential);
    }
  }

  return { employees, employeeCredentials, credentialHintPatches };
};
