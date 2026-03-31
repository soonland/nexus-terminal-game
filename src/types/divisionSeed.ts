import type { NodeTemplate } from './game';

// ── Division Seed Types ─────────────────────────────────────

export type TechProfile =
  | 'legacy_mixed'
  | 'hardened_airgap'
  | 'financial_grade'
  | 'executive_suite';

export type SecurityPosture = 'low' | 'medium' | 'high' | 'extreme';

export type CredentialPattern = 'contractor' | 'ops' | 'security' | 'finance' | 'executive';

export type DivisionId = 'external_perimeter' | 'operations' | 'security' | 'finance' | 'executive';

export interface FillerTemplateWeight {
  template: NodeTemplate;
  weight: number; // must be > 0 and <= 1; all entries in a division must sum to exactly 1.0
}

export interface DivisionSeed {
  divisionId: DivisionId;
  name: string;
  subnet: string;
  headcount: number;
  fillerCount: number; // explicit filler node count per division (used by Phase 4 generator)
  techProfile: TechProfile;
  credentialPattern: CredentialPattern;
  securityPosture: SecurityPosture;
  fillerTemplates: FillerTemplateWeight[];
  ariaInfluenceRate: number; // 0–1
}
