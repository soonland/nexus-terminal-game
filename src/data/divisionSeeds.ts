import type { DivisionSeed } from '../types/divisionSeed';

// ── Division Seeds ──────────────────────────────────────────
// Static configuration read by the Phase 4 procedural node generator.
// ariaInfluenceRate values per spec §6.3: 0.3 / 0.2 / 0.1 / 0.25 / 0.4
// fillerTemplates weights must sum to 1.0 per division.

export const DIVISION_SEEDS: DivisionSeed[] = [
  {
    divisionId: 'external_perimeter',
    name: 'External Perimeter',
    subnet: '10.0.0.0/24',
    headcount: 120,
    techProfile: 'legacy_mixed',
    credentialPattern: 'contractor',
    securityPosture: 'low',
    fillerTemplates: [
      { template: 'workstation', weight: 0.35 },
      { template: 'web_server', weight: 0.25 },
      { template: 'router_switch', weight: 0.2 },
      { template: 'printer', weight: 0.1 },
      { template: 'iot_device', weight: 0.1 },
    ],
    ariaInfluenceRate: 0.3,
  },
  {
    divisionId: 'operations',
    name: 'Operations',
    subnet: '10.1.0.0/24',
    headcount: 85,
    techProfile: 'legacy_mixed',
    credentialPattern: 'ops',
    securityPosture: 'medium',
    fillerTemplates: [
      { template: 'workstation', weight: 0.3 },
      { template: 'database_server', weight: 0.25 },
      { template: 'file_server', weight: 0.2 },
      { template: 'mail_server', weight: 0.15 },
      { template: 'router_switch', weight: 0.1 },
    ],
    ariaInfluenceRate: 0.2,
  },
  {
    divisionId: 'security',
    name: 'Security',
    subnet: '10.2.0.0/24',
    headcount: 40,
    techProfile: 'hardened_airgap',
    credentialPattern: 'security',
    securityPosture: 'extreme',
    fillerTemplates: [
      { template: 'security_node', weight: 0.4 },
      { template: 'workstation', weight: 0.25 },
      { template: 'database_server', weight: 0.2 },
      { template: 'router_switch', weight: 0.15 },
    ],
    ariaInfluenceRate: 0.1,
  },
  {
    divisionId: 'finance',
    name: 'Finance',
    subnet: '10.3.0.0/24',
    headcount: 60,
    techProfile: 'financial_grade',
    credentialPattern: 'finance',
    securityPosture: 'high',
    fillerTemplates: [
      { template: 'database_server', weight: 0.35 },
      { template: 'workstation', weight: 0.3 },
      { template: 'file_server', weight: 0.2 },
      { template: 'mail_server', weight: 0.15 },
    ],
    ariaInfluenceRate: 0.25,
  },
  {
    divisionId: 'executive',
    name: 'Executive',
    subnet: '10.4.0.0/24',
    headcount: 20,
    techProfile: 'executive_suite',
    credentialPattern: 'executive',
    securityPosture: 'high',
    fillerTemplates: [
      { template: 'workstation', weight: 0.4 },
      { template: 'file_server', weight: 0.25 },
      { template: 'mail_server', weight: 0.2 },
      { template: 'dev_server', weight: 0.15 }, // shadow IT: exec assistants run unsanctioned tools
    ],
    ariaInfluenceRate: 0.4,
  },
];
