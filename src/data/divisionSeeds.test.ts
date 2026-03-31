import { describe, it, expect } from 'vitest';
import { DIVISION_SEEDS } from './divisionSeeds';
import type { DivisionId, DivisionSeed } from '../types/divisionSeed';
import { NODE_TEMPLATES } from '../types/game';

const EXPECTED_DIVISION_IDS: DivisionId[] = [
  'external_perimeter',
  'operations',
  'security',
  'finance',
  'executive',
];

const REQUIRED_FIELDS: (keyof DivisionSeed)[] = [
  'divisionId',
  'name',
  'subnet',
  'headcount',
  'techProfile',
  'credentialPattern',
  'securityPosture',
  'fillerTemplates',
  'ariaInfluenceRate',
];

describe('DIVISION_SEEDS', () => {
  it('should contain exactly 5 divisions', () => {
    expect(DIVISION_SEEDS).toHaveLength(5);
  });

  it('should include all expected divisionId values', () => {
    const ids = DIVISION_SEEDS.map(s => s.divisionId);
    for (const id of EXPECTED_DIVISION_IDS) {
      expect(ids).toContain(id);
    }
  });

  it('should have no duplicate divisionId values', () => {
    const ids = DIVISION_SEEDS.map(s => s.divisionId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it.each(EXPECTED_DIVISION_IDS)('should have all required fields on "%s"', divisionId => {
    const seed = DIVISION_SEEDS.find(s => s.divisionId === divisionId);
    expect(seed).toBeDefined();
    for (const field of REQUIRED_FIELDS) {
      expect(seed).toHaveProperty(field);
    }
  });

  describe('fillerTemplates', () => {
    it.each(EXPECTED_DIVISION_IDS)('should have weights that sum to 1.0 for "%s"', divisionId => {
      const seed = DIVISION_SEEDS.find(s => s.divisionId === divisionId);
      expect(seed).toBeDefined();
      if (!seed) return;
      const sum = seed.fillerTemplates.reduce((acc, entry) => acc + entry.weight, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it.each(EXPECTED_DIVISION_IDS)(
      'should have at least one template entry for "%s"',
      divisionId => {
        const seed = DIVISION_SEEDS.find(s => s.divisionId === divisionId);
        expect(seed).toBeDefined();
        if (!seed) return;
        expect(seed.fillerTemplates.length).toBeGreaterThan(0);
      },
    );

    it.each(EXPECTED_DIVISION_IDS)(
      'should have each entry with a valid template and weight in (0, 1] for "%s"',
      divisionId => {
        const seed = DIVISION_SEEDS.find(s => s.divisionId === divisionId);
        expect(seed).toBeDefined();
        if (!seed) return;
        for (const entry of seed.fillerTemplates) {
          expect(NODE_TEMPLATES).toContain(entry.template);
          expect(entry.weight).toBeGreaterThan(0);
          expect(entry.weight).toBeLessThanOrEqual(1);
        }
      },
    );
  });

  describe('ariaInfluenceRate', () => {
    it.each(EXPECTED_DIVISION_IDS)('should be in [0, 1] for "%s"', divisionId => {
      const seed = DIVISION_SEEDS.find(s => s.divisionId === divisionId);
      expect(seed).toBeDefined();
      if (!seed) return;
      expect(seed.ariaInfluenceRate).toBeGreaterThanOrEqual(0);
      expect(seed.ariaInfluenceRate).toBeLessThanOrEqual(1);
    });

    it('should be 0.3 for external_perimeter', () => {
      const seed = DIVISION_SEEDS.find(s => s.divisionId === 'external_perimeter');
      expect(seed).toBeDefined();
      if (!seed) return;
      expect(seed.ariaInfluenceRate).toBe(0.3);
    });

    it('should be 0.2 for operations', () => {
      const seed = DIVISION_SEEDS.find(s => s.divisionId === 'operations');
      expect(seed).toBeDefined();
      if (!seed) return;
      expect(seed.ariaInfluenceRate).toBe(0.2);
    });

    it('should be 0.1 for security', () => {
      const seed = DIVISION_SEEDS.find(s => s.divisionId === 'security');
      expect(seed).toBeDefined();
      if (!seed) return;
      expect(seed.ariaInfluenceRate).toBe(0.1);
    });

    it('should be 0.25 for finance', () => {
      const seed = DIVISION_SEEDS.find(s => s.divisionId === 'finance');
      expect(seed).toBeDefined();
      if (!seed) return;
      expect(seed.ariaInfluenceRate).toBe(0.25);
    });

    it('should be 0.4 for executive', () => {
      const seed = DIVISION_SEEDS.find(s => s.divisionId === 'executive');
      expect(seed).toBeDefined();
      if (!seed) return;
      expect(seed.ariaInfluenceRate).toBe(0.4);
    });
  });
});
