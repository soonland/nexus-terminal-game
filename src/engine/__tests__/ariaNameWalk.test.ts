import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import { createInitialState } from '../state';
import produce from '../produce';
import { buildNodeMap } from '../../data/anchorNodes';
import { SENTINEL_VOTE_PATH } from '../ariaName';
import { runMailCommand } from '../mailCommand';
import { mailboxOf, unlockedOwners } from '../mail';
import type { GameState } from '../../types/game';

const ARIA = /aria/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

const textOf = (result: { lines: { content: string }[] }) =>
  result.lines.map(l => l.content).join('\n');

const atNode = (nodeId: string): GameState =>
  produce(createInitialState(), s => {
    s.network.currentNodeId = nodeId;
    s.network.nodes[nodeId]!.accessLevel = 'root';
  });

describe('engine output never says Aria before the reveal', () => {
  const lowerNodes = Object.values(buildNodeMap()).filter(n => n.layer < 5);

  it.each(lowerNodes.map(n => [n.id]))(
    'ls / scan / status / whoami / inventory at %s',
    async id => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      const state = atNode(id);
      for (const cmd of ['ls', 'scan', 'status', 'whoami', 'inventory']) {
        expect(textOf(await resolveCommand(cmd, state)), `${id}: ${cmd}`).not.toMatch(ARIA);
      }
    },
  );

  it.each(lowerNodes.map(n => [n.id]))('cat and exfil of every file at %s', async id => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const state = atNode(id);
    for (const file of state.network.nodes[id]!.files) {
      if (file.path === SENTINEL_VOTE_PATH) continue; // the one allowed bridge
      const cat = await resolveCommand(`cat ${file.path}`, state);
      expect(textOf(cat), `${id}: cat ${file.path}`).not.toMatch(ARIA);
      const exfil = await resolveCommand(`exfil ${file.path}`, state);
      expect(textOf(exfil), `${id}: exfil ${file.path}`).not.toMatch(ARIA);
      const tools = ((exfil.nextState ?? state) as GameState).player.tools;
      expect(JSON.stringify(tools), `${id}: tools after ${file.path}`).not.toMatch(ARIA);
    }
  });

  it('exfiltrating the key keeps the name hidden, including in the inventory', async () => {
    const state = atNode('exec_ceo');
    const exfil = await resolveCommand('exfil subnet_key.bin', state);
    expect(textOf(exfil)).not.toMatch(ARIA);
    const inventory = await resolveCommand('inventory', exfil.nextState as GameState);
    expect(textOf(inventory)).not.toMatch(ARIA);
    expect(textOf(inventory)).toMatch(/subnet-key/);
  });

  it('the msg usage line does not mention Aria until the name is known', async () => {
    const state = createInitialState();
    expect(textOf(await resolveCommand('msg', state))).not.toMatch(ARIA);
    const known = produce(state, s => {
      s.flags['ARIA_NAME_KNOWN'] = true;
    });
    expect(textOf(await resolveCommand('msg', known))).toMatch(/aria/i);
  });

  describe('mail', () => {
    const unlocked = (): GameState =>
      produce(createInitialState(5), s => {
        for (const c of s.player.credentials) c.obtained = true;
      });

    const responses: [string, () => ReturnType<typeof vi.fn>][] = [
      ['offline', () => vi.fn().mockRejectedValue(new Error('offline'))],
      [
        'unavailable',
        () =>
          vi
            .fn()
            .mockResolvedValue({ ok: true, json: () => Promise.resolve({ unavailable: true }) }),
      ],
      [
        'a normal answer',
        () =>
          vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
              Promise.resolve({
                messages: [
                  {
                    counterpart: 'Ops Desk',
                    direction: 'in',
                    subject: 'Maintenance window',
                    body: 'Routine patching tonight.',
                    day: 12,
                  },
                ],
              }),
          }),
      ],
    ];

    it.each(responses)('mail, mail <name> and mail read 1 stay clean when %s', async (_n, mk) => {
      vi.stubGlobal('fetch', mk());
      const state = unlocked();
      const owners = unlockedOwners(state).slice(0, 6);
      expect(owners.length).toBeGreaterThan(0);
      const out: string[] = [];
      const stored: string[] = [];
      let generated = 0;
      const summary = await runMailCommand('mail', state, null);
      out.push(...summary.lines.map(l => l.content));
      for (const owner of owners) {
        const opened = await runMailCommand(`mail ${owner.id}`, state, null);
        out.push(...opened.lines.map(l => l.content));
        const next = opened.nextState ?? state;
        for (const m of mailboxOf(next, owner.id)?.messages ?? []) {
          stored.push(m.subject, m.body);
          if (m.source === 'generated') generated += 1;
        }
        const read = await runMailCommand('mail read 1', next, owner.id);
        out.push(...read.lines.map(l => l.content));
      }
      expect(out.join('\n')).not.toMatch(/\baria\b/i);
      expect(stored.join('\n')).not.toMatch(/\baria\b/i);
      if (_n === 'a normal answer') expect(generated).toBeGreaterThan(0);
    });
  });
});
