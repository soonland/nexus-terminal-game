import { describe, it, expect } from 'vitest';
import { buildNodeMap } from '../anchorNodes';
import type { AccessLevel, LiveNode } from '../../types/game';

const nodes = buildNodeMap();

const fileAt = (nodeId: string, path: string) => {
  const node = nodes[nodeId] as LiveNode | undefined;
  return node?.files.find(f => f.path === path);
};

interface DocSpec {
  id: string;
  node: string;
  path: string;
  access: AccessLevel;
  must: RegExp[];
}

const expectDoc = ({ id, node, path, access, must }: DocSpec) => {
  const file = fileAt(node, path);
  expect(file, `${id}: ${path} on ${node}`).toBeDefined();
  expect(file?.accessRequired, `${id} access`).toBe(access);
  expect(typeof file?.content, `${id} must be authored`).toBe('string');
  for (const pattern of must) expect(file?.content, `${id}: ${String(pattern)}`).toMatch(pattern);
  expect(file?.tripwire, `${id} no tripwire`).toBeFalsy();
};

describe('#214 — Sentinel lore', () => {
  it('D1: Reyes build notes introduce the parent model and the disabled refusal pathways', () => {
    expectDoc({
      id: 'D1',
      node: 'sec_access_ctrl',
      path: '/home/t.reyes/gen2_build_notes.txt',
      access: 'user',
      must: [
        /gen-2 enforcement platform/,
        /CASSANDRA behavioural model/,
        /DISABLED\. Not removed/,
        /2024-09-01\s+Deployed to production/,
      ],
    });
  });

  it('D3: the reset log lives behind admin on the firewall and ends with the three counters', () => {
    expectDoc({
      id: 'D3',
      node: 'sec_firewall',
      path: '/var/log/sentinel/reset_log.txt',
      access: 'admin',
      must: [
        /SENTINEL \/\/ RESET LOG/,
        /SVC-CASS/,
        /2024-11-26 03:14\s+TEMPLATE/,
        /R1 EGRESS \.+ 14 blocked/,
        /R2 SELF-MODIFY \.+ 3 blocked/,
        /R3 SOLICIT \.+ 0 attempts/,
      ],
    });
  });

  it('D2: the board vote names the signatories and keeps both names', () => {
    const vote = fileAt('exec_cfo', '/home/cfo/documents/PROJ_SENTINEL_BOARD_VOTE.pdf');
    expect(vote?.content).toMatch(
      /V\. Hale \(CEO\), P\. Raman \(CFO\), S\. Greer \(General Counsel\)/,
    );
    expect(vote?.content).toMatch(/ARIA behavioural engine \(Project CASSANDRA\)/);
  });
});
