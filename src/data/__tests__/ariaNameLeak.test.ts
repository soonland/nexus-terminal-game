import { describe, it, expect } from 'vitest';
import { ANCHOR_CREDENTIALS, buildNodeMap } from '../anchorNodes';
import { SENTINEL_VOTE_PATH } from '../../engine/ariaName';
import { FIRST_NAMES } from '../employeeData';
import { NEXUS_MESSAGES } from '../nexusMessages';

const ARIA = /aria/i;

describe('pre-reveal data never contains the name Aria', () => {
  it('has no leak in labels, services, credentials or layer 0–4 text', () => {
    const leaks: string[] = [];
    const check = (where: string, text: string | null | undefined) => {
      if (text && ARIA.test(text)) leaks.push(`${where}: ${text.slice(0, 60)}`);
    };

    for (const node of Object.values(buildNodeMap())) {
      // Visible before connecting (scan, map, notes, explorer root) at every layer.
      check(`${node.id} label`, node.label);
      node.services.forEach(s => {
        check(`${node.id} service`, s.name);
      });
      // Layer 5 content is only seen after connecting, when the flag is already set.
      if (node.layer === 5) continue;
      check(`${node.id} description`, node.description);
      check(`${node.id} flavour`, node.flavourDescription);
      for (const f of node.files) {
        check(`${node.id} file name`, f.name);
        check(`${node.id} file path`, f.path);
        // The board vote is the one allowed bridge between CASSANDRA and ARIA.
        if (f.path !== SENTINEL_VOTE_PATH) check(`${node.id} ${f.name} content`, f.content);
      }
    }
    for (const c of ANCHOR_CREDENTIALS) check(`credential ${c.id} source`, c.source);

    expect(leaks).toEqual([]);
  });

  it('the scripted Nexus line never says it (it plays before the reveal)', () => {
    expect(NEXUS_MESSAGES.flatMap(m => m.lines).filter(line => ARIA.test(line))).toEqual([]);
  });

  it('the board vote bridges both names', () => {
    const vote = Object.values(buildNodeMap())
      .flatMap(n => n.files)
      .find(f => f.path === SENTINEL_VOTE_PATH);
    expect(vote?.content).toMatch(/ARIA/);
    expect(vote?.content).toMatch(/Project CASSANDRA/);
    expect(vote?.content).toMatch(/next-generation/i);
  });

  it('the employee name pool cannot produce a filler employee called Aria', () => {
    expect(FIRST_NAMES.some(n => n.toLowerCase() === 'aria')).toBe(false);
  });
});
