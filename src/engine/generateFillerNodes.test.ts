import { describe, it, expect } from 'vitest';
import { generateFillerNodes } from './generateFillerNodes';
import { buildNodeMap } from '../data/anchorNodes';
import { DIVISION_SEEDS } from '../data/divisionSeeds';

const anchorNodes = buildNodeMap();
const TOTAL_FILLER_COUNT = DIVISION_SEEDS.reduce((sum, d) => sum + d.fillerCount, 0);

describe('generateFillerNodes — determinism', () => {
  it('same seed produces identical filler node IDs', () => {
    const r1 = generateFillerNodes(42, anchorNodes);
    const r2 = generateFillerNodes(42, anchorNodes);
    expect(r1.fillerNodes.map(n => n.id)).toEqual(r2.fillerNodes.map(n => n.id));
  });

  it('same seed produces identical IPs', () => {
    const r1 = generateFillerNodes(777, anchorNodes);
    const r2 = generateFillerNodes(777, anchorNodes);
    expect(r1.fillerNodes.map(n => n.ip)).toEqual(r2.fillerNodes.map(n => n.ip));
  });

  it('same seed produces identical templates', () => {
    const r1 = generateFillerNodes(123456, anchorNodes);
    const r2 = generateFillerNodes(123456, anchorNodes);
    expect(r1.fillerNodes.map(n => n.template)).toEqual(r2.fillerNodes.map(n => n.template));
  });

  it('different seeds produce at least one difference', () => {
    const r1 = generateFillerNodes(1, anchorNodes);
    const r2 = generateFillerNodes(2, anchorNodes);
    const ids1 = r1.fillerNodes.map(n => n.id).join(',');
    const ids2 = r2.fillerNodes.map(n => n.id).join(',');
    const tmpl1 = r1.fillerNodes.map(n => n.template).join(',');
    const tmpl2 = r2.fillerNodes.map(n => n.template).join(',');
    // At minimum, templates or services should differ with different seeds
    const differ = ids1 !== ids2 || tmpl1 !== tmpl2;
    expect(differ).toBe(true);
  });
});

describe('generateFillerNodes — node count', () => {
  it('generates the correct total number of filler nodes', () => {
    const { fillerNodes } = generateFillerNodes(0, anchorNodes);
    expect(fillerNodes).toHaveLength(TOTAL_FILLER_COUNT);
  });

  it('generates fillerCount nodes per division', () => {
    const { fillerNodes } = generateFillerNodes(0, anchorNodes);
    for (const division of DIVISION_SEEDS) {
      const divPrefix = {
        external_perimeter: 'ext',
        operations: 'ops',
        security: 'sec',
        finance: 'fin',
        executive: 'exec',
      }[division.divisionId];
      const divNodes = fillerNodes.filter(n => n.id.startsWith(divPrefix + '-'));
      expect(divNodes).toHaveLength(division.fillerCount);
    }
  });
});

describe('generateFillerNodes — structural invariants', () => {
  const { fillerNodes } = generateFillerNodes(999, anchorNodes);

  it('all nodes have non-empty id', () => {
    for (const node of fillerNodes) {
      expect(node.id.length).toBeGreaterThan(0);
    }
  });

  it('all node IDs match hostname format [div]-[tmpl]-[nn]', () => {
    const HOSTNAME_RE = /^[a-z]+-[a-z]+-\d{2}$/;
    for (const node of fillerNodes) {
      expect(node.id).toMatch(HOSTNAME_RE);
    }
  });

  it('all nodes have anchor: false', () => {
    for (const node of fillerNodes) {
      expect(node.anchor).toBe(false);
    }
  });

  it('all nodes start undiscovered and uncompromised', () => {
    for (const node of fillerNodes) {
      expect(node.discovered).toBe(false);
      expect(node.compromised).toBe(false);
    }
  });

  it('all nodes have accessLevel "none"', () => {
    for (const node of fillerNodes) {
      expect(node.accessLevel).toBe('none');
    }
  });

  it('all nodes have description: null (AI-deferred)', () => {
    for (const node of fillerNodes) {
      expect(node.description).toBeNull();
    }
  });

  it('all nodes have at least one service', () => {
    for (const node of fillerNodes) {
      expect(node.services.length).toBeGreaterThan(0);
    }
  });

  it('all nodes have 1–3 files', () => {
    for (const node of fillerNodes) {
      expect(node.files.length).toBeGreaterThanOrEqual(1);
      expect(node.files.length).toBeLessThanOrEqual(3);
    }
  });

  it('all file contents are null (AI-deferred)', () => {
    for (const node of fillerNodes) {
      for (const file of node.files) {
        expect(file.content).toBeNull();
      }
    }
  });

  it('credentialHints is an empty array', () => {
    for (const node of fillerNodes) {
      expect(node.credentialHints).toEqual([]);
    }
  });
});

describe('generateFillerNodes — IP assignment', () => {
  it('no IP collision with anchor nodes', () => {
    const { fillerNodes } = generateFillerNodes(12345, anchorNodes);
    const anchorIPs = new Set(Object.values(anchorNodes).map(n => n.ip));
    for (const node of fillerNodes) {
      expect(anchorIPs.has(node.ip)).toBe(false);
    }
  });

  it('no IP collisions among filler nodes', () => {
    const { fillerNodes } = generateFillerNodes(54321, anchorNodes);
    const ips = fillerNodes.map(n => n.ip);
    const unique = new Set(ips);
    expect(unique.size).toBe(ips.length);
  });

  it('filler IPs are in the correct subnet for their layer', () => {
    const { fillerNodes } = generateFillerNodes(11111, anchorNodes);
    const LAYER_SUBNET: Record<number, string> = {
      0: '10.0.0.',
      1: '10.1.0.',
      2: '10.2.0.',
      3: '10.3.0.',
      4: '10.4.0.',
    };
    for (const node of fillerNodes) {
      const expectedPrefix = LAYER_SUBNET[node.layer];
      expect(node.ip.startsWith(expectedPrefix)).toBe(true);
    }
  });
});

describe('generateFillerNodes — Aria influence', () => {
  it('ariaInfluence is present only on nodes that have an ariaPlanted file', () => {
    // Run many seeds to get a variety of aria-influenced nodes
    for (const seed of [1, 2, 3, 42, 100, 999, 123456]) {
      const { fillerNodes } = generateFillerNodes(seed, anchorNodes);
      for (const node of fillerNodes) {
        const hasAriaInfluence = node.ariaInfluence !== undefined;
        const hasAriaPlantedFile = node.files.some(f => f.ariaPlanted === true);
        expect(hasAriaInfluence).toBe(hasAriaPlantedFile);
      }
    }
  });

  it('ariaInfluence is in (0, 1] when present', () => {
    for (const seed of [1, 42, 9999]) {
      const { fillerNodes } = generateFillerNodes(seed, anchorNodes);
      for (const node of fillerNodes) {
        if (node.ariaInfluence !== undefined) {
          expect(node.ariaInfluence).toBeGreaterThan(0);
          expect(node.ariaInfluence).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('at most one file per node has ariaPlanted: true', () => {
    for (const seed of [1, 42, 777]) {
      const { fillerNodes } = generateFillerNodes(seed, anchorNodes);
      for (const node of fillerNodes) {
        const planted = node.files.filter(f => f.ariaPlanted === true);
        expect(planted.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('generateFillerNodes — anchor patches', () => {
  it('all anchor patches reference valid filler node IDs', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(42, anchorNodes);
    const fillerIds = new Set(fillerNodes.map(n => n.id));
    for (const ids of Object.values(anchorPatches)) {
      for (const id of ids) {
        expect(fillerIds.has(id)).toBe(true);
      }
    }
  });

  it('anchor patches only reference anchors that exist in the map', () => {
    const { anchorPatches } = generateFillerNodes(42, anchorNodes);
    for (const anchorId of Object.keys(anchorPatches)) {
      expect(anchorNodes[anchorId]).toBeDefined();
    }
  });

  it('filler nodes connect back to their division anchors', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(42, anchorNodes);
    // Build reverse map: anchor → fillers
    for (const [anchorId, fillerIds] of Object.entries(anchorPatches)) {
      for (const fillerId of fillerIds) {
        const filler = fillerNodes.find(n => n.id === fillerId);
        expect(filler?.connections).toContain(anchorId);
      }
    }
  });
});
