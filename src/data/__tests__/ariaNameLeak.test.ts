import { describe, it, expect } from 'vitest';
import { ANCHOR_CREDENTIALS, buildNodeMap } from '../anchorNodes';
import { SENTINEL_VOTE_PATH } from '../../engine/ariaName';
import { FIRST_NAMES } from '../employeeData';
import { NEXUS_MESSAGES } from '../nexusMessages';
import { CASE_FACTS, CASE_PEOPLE } from '../casebook';
import { CAMERA_FEEDS } from '../cameras';
import { buildCasebook } from '../../engine/casebook';
import { createInitialState } from '../../engine/state';
import { fileReadKey } from '../../types/game';

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

  it('the camera feeds (view-cam and the CAM tab) never say it', () => {
    const text = CAMERA_FEEDS.flatMap(f => [f.label, f.description, f.offlineReason ?? '']);
    expect(text.filter(t => ARIA.test(t))).toEqual([]);
  });

  it('the casebook never says it, however much the player has read and obtained', () => {
    const authored = [
      ...CASE_PEOPLE.flatMap(p => [p.name, p.role]),
      ...CASE_FACTS.flatMap(f => [f.text, f.title ?? '']),
    ];
    expect(authored.filter(text => ARIA.test(text))).toEqual([]);

    // The rendered casebook with every document read and every credential obtained. Generated
    // employees can be called Maria or have a password like 'ariel@861', so match the name as a
    // whole word here (the authored text above is held to the stricter substring match).
    const state = createInitialState();
    state.filesRead = CASE_FACTS.map(f => fileReadKey(f.source.nodeId, f.source.path));
    for (const credential of state.player.credentials) credential.obtained = true;
    for (const employee of state.employees) {
      const world = state.worldCredentials.find(c => c.id === `cred_${employee.id}`);
      if (world) state.player.credentials.push({ ...world, obtained: true });
    }
    expect(/\baria\b/i.test(JSON.stringify(buildCasebook(state)))).toBe(false);
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
