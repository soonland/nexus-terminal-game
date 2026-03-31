import type { DivisionId } from './divisionSeed';

// ── Employee ────────────────────────────────────────────────

export interface Employee {
  id: string; // e.g. "emp_ext_042"
  firstName: string;
  lastName: string;
  divisionId: DivisionId;
  role: string;
  username: string; // firstname.lastname (unique within the run)
  email: string; // username@irongate.corp
  workstationId: string; // ID of a filler node in the same division
  traits: string[]; // 1–2 division-appropriate weaknesses — internal only, never shown to player
}
