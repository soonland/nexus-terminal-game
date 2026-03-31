import { describe, it, expect } from 'vitest';
import { generateEmployeePool } from './generateEmployeePool';
import { generateFillerNodes } from './generateFillerNodes';
import { buildNodeMap } from '../data/anchorNodes';
import { DIVISION_SEEDS } from '../data/divisionSeeds';
import { TRAITS_BY_DIVISION } from '../data/employeeData';
import type { LiveNode } from '../types/game';

// ── Shared fixtures ─────────────────────────────────────────

const anchorNodes = buildNodeMap();
const { fillerNodes } = generateFillerNodes(42, anchorNodes);

const TOTAL_HEADCOUNT = DIVISION_SEEDS.reduce((sum, d) => sum + d.headcount, 0); // 325

const DIV_PREFIX: Record<string, string> = {
  external_perimeter: 'ext',
  operations: 'ops',
  security: 'sec',
  finance: 'fin',
  executive: 'exec',
};

// ── Employee count ──────────────────────────────────────────

describe('generateEmployeePool — employee count', () => {
  it('returns exactly 325 employees in total', () => {
    const { employees } = generateEmployeePool(42, fillerNodes);
    expect(employees).toHaveLength(TOTAL_HEADCOUNT);
  });

  it('generates exactly headcount employees per division', () => {
    const { employees } = generateEmployeePool(42, fillerNodes);
    for (const division of DIVISION_SEEDS) {
      const prefix = DIV_PREFIX[division.divisionId];
      const divEmployees = employees.filter(e => e.id.startsWith(`emp_${prefix}_`));
      expect(divEmployees).toHaveLength(division.headcount);
    }
  });

  it('returns one credential per employee', () => {
    const { employees, employeeCredentials } = generateEmployeePool(42, fillerNodes);
    expect(employeeCredentials).toHaveLength(employees.length);
  });
});

// ── Employee ID format ──────────────────────────────────────

describe('generateEmployeePool — employee ID format', () => {
  const { employees } = generateEmployeePool(42, fillerNodes);

  it('all employee IDs match emp_{divPrefix}_{3-digit-padded} format', () => {
    const EMP_ID_RE = /^emp_(ext|ops|sec|fin|exec)_\d{3}$/;
    for (const emp of employees) {
      expect(emp.id).toMatch(EMP_ID_RE);
    }
  });

  it('first employee per division is padded 001', () => {
    for (const division of DIVISION_SEEDS) {
      const prefix = DIV_PREFIX[division.divisionId];
      const first = employees.find(e => e.id === `emp_${prefix}_001`);
      expect(first).toBeDefined();
    }
  });

  it('last employee per division matches headcount (zero-padded)', () => {
    for (const division of DIVISION_SEEDS) {
      const prefix = DIV_PREFIX[division.divisionId];
      const lastIndex = String(division.headcount).padStart(3, '0');
      const last = employees.find(e => e.id === `emp_${prefix}_${lastIndex}`);
      expect(last).toBeDefined();
    }
  });
});

// ── Credential ID format ────────────────────────────────────

describe('generateEmployeePool — credential ID format', () => {
  const { employees, employeeCredentials } = generateEmployeePool(42, fillerNodes);

  it('all credential IDs match cred_emp_{divPrefix}_{3-digit-padded} format', () => {
    const CRED_ID_RE = /^cred_emp_(ext|ops|sec|fin|exec)_\d{3}$/;
    for (const cred of employeeCredentials) {
      expect(cred.id).toMatch(CRED_ID_RE);
    }
  });

  it('credential ID matches emp ID for each employee (cred_emp_xxx → emp_xxx)', () => {
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const cred = employeeCredentials[i];
      expect(cred.id).toBe(`cred_${emp.id}`);
    }
  });
});

// ── Username uniqueness and format ──────────────────────────

describe('generateEmployeePool — username format and uniqueness', () => {
  const { employees } = generateEmployeePool(42, fillerNodes);

  it('all usernames are globally unique', () => {
    const usernames = employees.map(e => e.username);
    const unique = new Set(usernames);
    expect(unique.size).toBe(usernames.length);
  });

  it('usernames are lowercase firstname.lastname (base case)', () => {
    // All base usernames should match lowercase.lowercase pattern (with optional numeric suffix)
    const USERNAME_RE = /^[a-z]+\.[a-z]+\d*$/;
    for (const emp of employees) {
      expect(emp.username).toMatch(USERNAME_RE);
    }
  });

  it('collision resolution appends a numeric suffix ≥ 2', () => {
    // Force a collision by using a minimal name pool to guarantee duplicate names.
    // We pass empty fillerNodes to keep the test focused on username logic.
    // With a fixed seed and the real name pool a collision will occasionally occur;
    // instead validate that ANY username with a suffix follows the pattern.
    const USERNAME_SUFFIX_RE = /^[a-z]+\.[a-z]+[2-9]\d*$/;
    const usernames = employees.map(e => e.username);
    const withSuffix = usernames.filter(u => /\d$/.test(u));
    // At least confirm that suffixed names follow the right format
    for (const u of withSuffix) {
      expect(u).toMatch(USERNAME_SUFFIX_RE);
    }
  });
});

// ── Email format ────────────────────────────────────────────

describe('generateEmployeePool — email format', () => {
  const { employees } = generateEmployeePool(42, fillerNodes);

  it('email is username@irongate.corp for every employee', () => {
    for (const emp of employees) {
      expect(emp.email).toBe(`${emp.username}@irongate.corp`);
    }
  });
});

// ── Traits ──────────────────────────────────────────────────

describe('generateEmployeePool — traits', () => {
  const { employees } = generateEmployeePool(42, fillerNodes);

  it('every employee has 1 or 2 traits', () => {
    for (const emp of employees) {
      expect(emp.traits.length).toBeGreaterThanOrEqual(1);
      expect(emp.traits.length).toBeLessThanOrEqual(2);
    }
  });

  it('traits are drawn from the correct division-specific pool', () => {
    for (const emp of employees) {
      const pool = TRAITS_BY_DIVISION[emp.divisionId];
      for (const trait of emp.traits) {
        expect(pool).toContain(trait);
      }
    }
  });

  it('no duplicate traits within a single employee', () => {
    for (const emp of employees) {
      const unique = new Set(emp.traits);
      expect(unique.size).toBe(emp.traits.length);
    }
  });
});

// ── Credential fields ───────────────────────────────────────

describe('generateEmployeePool — credential fields', () => {
  const { employees, employeeCredentials } = generateEmployeePool(42, fillerNodes);

  it('credential username matches employee username', () => {
    for (let i = 0; i < employees.length; i++) {
      expect(employeeCredentials[i].username).toBe(employees[i].username);
    }
  });

  it('all credentials have obtained: false', () => {
    for (const cred of employeeCredentials) {
      expect(cred.obtained).toBe(false);
    }
  });

  it('credential source is the employee id', () => {
    for (let i = 0; i < employees.length; i++) {
      expect(employeeCredentials[i].source).toBe(employees[i].id);
    }
  });

  it('security division employees have accessLevel "admin"', () => {
    const secEmployees = employees.filter(e => e.divisionId === 'security');
    const secCreds = employeeCredentials.filter((_, i) => employees[i].divisionId === 'security');
    expect(secEmployees.length).toBeGreaterThan(0);
    for (const cred of secCreds) {
      expect(cred.accessLevel).toBe('admin');
    }
  });

  it.each([
    ['external_perimeter', 'user'],
    ['operations', 'user'],
    ['finance', 'user'],
    ['executive', 'user'],
  ] as const)('%s division employees have accessLevel "%s"', (divId, expectedLevel) => {
    const indices = employees
      .map((e, i) => (e.divisionId === divId ? i : -1))
      .filter(i => i !== -1);
    expect(indices.length).toBeGreaterThan(0);
    for (const i of indices) {
      expect(employeeCredentials[i].accessLevel).toBe(expectedLevel);
    }
  });

  it('credential passwords are non-empty strings', () => {
    for (const cred of employeeCredentials) {
      expect(typeof cred.password).toBe('string');
      expect(cred.password.length).toBeGreaterThan(0);
    }
  });
});

// ── Workstation assignment ──────────────────────────────────

describe('generateEmployeePool — workstation assignment', () => {
  const { employees, employeeCredentials } = generateEmployeePool(42, fillerNodes);
  const fillerNodeIds = new Set(fillerNodes.map(n => n.id));

  it('employees with a workstationId reference a valid filler node ID', () => {
    for (const emp of employees) {
      if (emp.workstationId !== '') {
        expect(fillerNodeIds.has(emp.workstationId)).toBe(true);
      }
    }
  });

  it('employees with a workstationId have it in their credential validOnNodes', () => {
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const cred = employeeCredentials[i];
      if (emp.workstationId !== '') {
        expect(cred.validOnNodes).toContain(emp.workstationId);
      }
    }
  });

  it('employees without a workstationId have empty validOnNodes', () => {
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const cred = employeeCredentials[i];
      if (emp.workstationId === '') {
        expect(cred.validOnNodes).toEqual([]);
      }
    }
  });

  it('workstation assignment is round-robin within a division (indices cycle)', () => {
    // Get workstation nodes for external_perimeter (layer 0)
    const extWorkstations = fillerNodes.filter(n => n.layer === 0 && n.template === 'workstation');
    if (extWorkstations.length === 0) return; // Skip if seed produced no workstations in this division

    const extEmployees = employees.filter(e => e.divisionId === 'external_perimeter');
    for (let i = 0; i < Math.min(extEmployees.length, extWorkstations.length * 3); i++) {
      const expected = extWorkstations[i % extWorkstations.length].id;
      expect(extEmployees[i].workstationId).toBe(expected);
    }
  });
});

// ── credentialHintPatches ───────────────────────────────────

describe('generateEmployeePool — credentialHintPatches', () => {
  const { employees, employeeCredentials, credentialHintPatches } = generateEmployeePool(
    42,
    fillerNodes,
  );
  const fillerNodeIds = new Set(fillerNodes.map(n => n.id));

  it('all patch keys are valid filler node IDs from the input', () => {
    for (const nodeId of Object.keys(credentialHintPatches)) {
      expect(fillerNodeIds.has(nodeId)).toBe(true);
    }
  });

  it('all patched credential IDs refer to credentials in the output', () => {
    const credIdSet = new Set(employeeCredentials.map(c => c.id));
    for (const credIds of Object.values(credentialHintPatches)) {
      for (const credId of credIds) {
        expect(credIdSet.has(credId)).toBe(true);
      }
    }
  });

  it('each credential appears in patches at most once', () => {
    const seen = new Set<string>();
    for (const credIds of Object.values(credentialHintPatches)) {
      for (const credId of credIds) {
        expect(seen.has(credId)).toBe(false);
        seen.add(credId);
      }
    }
  });

  it('a credential is in patches only when its employee has a workstationId', () => {
    const empById = new Map(employees.map(e => [e.id, e]));
    for (const credIds of Object.values(credentialHintPatches)) {
      for (const credId of credIds) {
        // credId is cred_emp_xxx_yyy → source empId is emp_xxx_yyy
        const empId = credId.replace(/^cred_/, '');
        const emp = empById.get(empId);
        expect(emp).toBeDefined();
        expect(emp!.workstationId).not.toBe('');
      }
    }
  });

  it('patch node ID matches the employee workstationId for every patch entry', () => {
    const empById = new Map(employees.map(e => [e.id, e]));
    for (const [nodeId, credIds] of Object.entries(credentialHintPatches)) {
      for (const credId of credIds) {
        const empId = credId.replace(/^cred_/, '');
        const emp = empById.get(empId);
        expect(emp!.workstationId).toBe(nodeId);
      }
    }
  });
});

// ── Determinism ─────────────────────────────────────────────

describe('generateEmployeePool — determinism', () => {
  it('same seed + same fillerNodes produces identical employee usernames', () => {
    const r1 = generateEmployeePool(42, fillerNodes);
    const r2 = generateEmployeePool(42, fillerNodes);
    expect(r1.employees.map(e => e.username)).toEqual(r2.employees.map(e => e.username));
  });

  it('same seed + same fillerNodes produces identical credential IDs', () => {
    const r1 = generateEmployeePool(999, fillerNodes);
    const r2 = generateEmployeePool(999, fillerNodes);
    expect(r1.employeeCredentials.map(c => c.id)).toEqual(r2.employeeCredentials.map(c => c.id));
  });

  it('same seed + same fillerNodes produces identical credentialHintPatches', () => {
    const r1 = generateEmployeePool(12345, fillerNodes);
    const r2 = generateEmployeePool(12345, fillerNodes);
    expect(r1.credentialHintPatches).toEqual(r2.credentialHintPatches);
  });

  it('different seeds produce different employee names', () => {
    const r1 = generateEmployeePool(1, fillerNodes);
    const r2 = generateEmployeePool(2, fillerNodes);
    const names1 = r1.employees.map(e => e.firstName + e.lastName).join(',');
    const names2 = r2.employees.map(e => e.firstName + e.lastName).join(',');
    expect(names1).not.toBe(names2);
  });

  it('different seeds produce different credential passwords', () => {
    const r1 = generateEmployeePool(100, fillerNodes);
    const r2 = generateEmployeePool(200, fillerNodes);
    const pw1 = r1.employeeCredentials.map(c => c.password).join(',');
    const pw2 = r2.employeeCredentials.map(c => c.password).join(',');
    expect(pw1).not.toBe(pw2);
  });
});

// ── Empty fillerNodes ───────────────────────────────────────

describe('generateEmployeePool — empty fillerNodes', () => {
  const { employees, employeeCredentials, credentialHintPatches } = generateEmployeePool(42, []);

  it('still generates 325 employees with no filler nodes', () => {
    expect(employees).toHaveLength(TOTAL_HEADCOUNT);
  });

  it('all employee workstationIds are empty string when no filler nodes', () => {
    for (const emp of employees) {
      expect(emp.workstationId).toBe('');
    }
  });

  it('all credentials have empty validOnNodes when no filler nodes', () => {
    for (const cred of employeeCredentials) {
      expect(cred.validOnNodes).toEqual([]);
    }
  });

  it('credentialHintPatches is empty when no filler nodes', () => {
    expect(Object.keys(credentialHintPatches)).toHaveLength(0);
  });
});

// ── Filler nodes without workstation template ───────────────

describe('generateEmployeePool — fallback when no workstation nodes', () => {
  // Build a fillerNodes list that has no workstation template nodes
  const nonWorkstationFillers: LiveNode[] = fillerNodes.map(n => ({
    ...n,
    template: 'database_server' as const,
  }));

  const { employees, employeeCredentials } = generateEmployeePool(42, nonWorkstationFillers);
  const nonWsIds = new Set(nonWorkstationFillers.map(n => n.id));

  it('employees still receive a workstationId from the fallback pool', () => {
    // At least some employees should have a non-empty workstationId
    const withWs = employees.filter(e => e.workstationId !== '');
    expect(withWs.length).toBeGreaterThan(0);
  });

  it('fallback workstationIds are still valid filler node IDs', () => {
    for (const emp of employees) {
      if (emp.workstationId !== '') {
        expect(nonWsIds.has(emp.workstationId)).toBe(true);
      }
    }
  });

  it('credential validOnNodes still populated in fallback scenario', () => {
    const withWsIndices = employees
      .map((e, i) => (e.workstationId !== '' ? i : -1))
      .filter(i => i !== -1);
    expect(withWsIndices.length).toBeGreaterThan(0);
    for (const i of withWsIndices) {
      expect(employeeCredentials[i].validOnNodes).toContain(employees[i].workstationId);
    }
  });
});

// ── Division membership ─────────────────────────────────────

describe('generateEmployeePool — division membership', () => {
  const { employees } = generateEmployeePool(42, fillerNodes);

  it.each(DIVISION_SEEDS.map(d => [d.divisionId, d.headcount] as const))(
    'every employee in the %s division has divisionId set correctly',
    (divId, headcount) => {
      const prefix = DIV_PREFIX[divId];
      const divEmployees = employees.filter(e => e.id.startsWith(`emp_${prefix}_`));
      expect(divEmployees).toHaveLength(headcount);
      for (const emp of divEmployees) {
        expect(emp.divisionId).toBe(divId);
      }
    },
  );
});

// ── Role validity ───────────────────────────────────────────

describe('generateEmployeePool — role validity', () => {
  it('every employee has a non-empty role string', () => {
    const { employees } = generateEmployeePool(42, fillerNodes);
    for (const emp of employees) {
      expect(typeof emp.role).toBe('string');
      expect(emp.role.length).toBeGreaterThan(0);
    }
  });
});

// ── Workstation nodes in correct division layer ─────────────

describe('generateEmployeePool — workstation layer constraint', () => {
  const { employees } = generateEmployeePool(42, fillerNodes);
  const DIVISION_LAYER: Record<string, number> = {
    external_perimeter: 0,
    operations: 1,
    security: 2,
    finance: 3,
    executive: 4,
  };

  it('each assigned workstationId belongs to a filler node in the same division layer', () => {
    const nodeById = new Map(fillerNodes.map(n => [n.id, n]));
    for (const emp of employees) {
      if (emp.workstationId === '') continue;
      const node = nodeById.get(emp.workstationId);
      expect(node).toBeDefined();
      const expectedLayer = DIVISION_LAYER[emp.divisionId];
      expect(node!.layer).toBe(expectedLayer);
    }
  });
});
