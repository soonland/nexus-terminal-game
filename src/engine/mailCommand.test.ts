import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isMailCommand, runMailCommand } from './mailCommand';
import { createInitialState } from './state';
import produce from './produce';
import type { GameState } from '../types/game';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const locked = (): GameState =>
  produce(createInitialState(5), s => {
    for (const c of s.player.credentials) c.obtained = false;
  });

const withTorres = (): GameState =>
  produce(locked(), s => {
    const c = s.player.credentials.find(x => x.id === 'cred_exec_assistant');
    if (c) c.obtained = true;
  });

const text = (r: { lines: Array<{ content: string }> }): string =>
  r.lines.map(l => l.content).join('\n');

describe('isMailCommand', () => {
  it.each([
    ['mail', true],
    ['  MAIL  ', true],
    ['mail torres', true],
    ['mail read 2', true],
    ['mailer', false],
    ['email', false],
    ['cat mail.txt', false],
  ])('%s → %s', (raw, expected) => {
    expect(isMailCommand(raw)).toBe(expected);
  });
});

describe('mail (summary)', () => {
  it('says nothing is unlocked yet and still opens the tab', async () => {
    const r = await runMailCommand('mail', locked(), null);
    expect(r.showTab).toBe(true);
    expect(text(r)).toContain('No mailboxes unlocked yet');
    expect(r.nextState).toBeUndefined();
  });

  it('counts unlocked mailboxes', async () => {
    const r = await runMailCommand('mail', withTorres(), null);
    expect(text(r)).toContain('1 mailbox');
  });
});

describe('mail <name>', () => {
  it('opens an unlocked mailbox, stores it and prints one summary line', async () => {
    const r = await runMailCommand('mail torres', withTorres(), null);
    expect(r.ownerId).toBe('torres');
    expect(r.showTab).toBe(true);
    const box = r.nextState?.mailboxes['torres'];
    expect(box).toBeDefined();
    const n = box?.messages.length ?? 0;
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].type).toBe('system');
    expect(r.lines[0].content).toBe(
      `Elena Torres (e.torres): ${String(n)} ${n === 1 ? 'message' : 'messages'}, ${String(n)} unread`,
    );
    expect(text(r)).not.toMatch(/2024-10-/);
  });

  it('says "1 message" in the singular', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [] }),
      }),
    );
    const state = produce(withTorres(), s => {
      s.mailboxes['torres'] = {
        ownerId: 'torres',
        messages: [
          {
            id: 'only',
            threadId: 'only',
            from: 'A',
            to: 'B',
            subject: 'S',
            body: 'b',
            sentAt: '2024-10-01',
            source: 'generated',
          },
        ],
      };
    });
    const r = await runMailCommand('mail torres', state, null);
    expect(text(r)).toBe('Elena Torres (e.torres): 1 message, 1 unread');
  });

  it('opens a mailbox by login name', async () => {
    const state = produce(withTorres(), s => {
      const c = s.player.credentials.find(x => x.id === 'cred_sec_analyst');
      if (c) c.obtained = true;
    });
    const r = await runMailCommand('mail j.mercer', state, null);
    expect(r.ownerId).toBe('mercer');
    expect(text(r)).toContain('(j.mercer)');
  });

  it('refuses a locked or unknown name without changing state', async () => {
    for (const name of ['mercer', 'nobody']) {
      const r = await runMailCommand(`mail ${name}`, withTorres(), null);
      expect(text(r)).toContain('mail: no credentials for that account');
      expect(r.nextState).toBeUndefined();
      expect(r.ownerId).toBeUndefined();
    }
  });
});

describe('mail read <n>', () => {
  it('needs an open mailbox first', async () => {
    const r = await runMailCommand('mail read 1', withTorres(), null);
    expect(text(r)).toContain('mail: open a mailbox first');
  });

  it('prints one line, returns the message id and marks it read', async () => {
    const opened = await runMailCommand('mail torres', withTorres(), null);
    const state = opened.nextState as GameState;
    const r = await runMailCommand('mail read 1', state, 'torres');
    const first = state.mailboxes['torres'].messages[0];
    expect(r.lines).toHaveLength(1);
    expect(text(r)).toBe(`Read: ${first.subject}`);
    expect(text(r)).not.toContain('Subject:');
    expect(text(r)).not.toContain(first.body);
    expect(r.messageId).toBe(first.id);
    expect(r.ownerId).toBe('torres');
    expect(r.nextState?.mailRead).toContain(first.id);
  });

  it.each(['0', '99', 'abc', '-1', '1.5', ''])('rejects "%s"', async arg => {
    const opened = await runMailCommand('mail torres', withTorres(), null);
    const r = await runMailCommand(`mail read ${arg}`, opened.nextState as GameState, 'torres');
    expect(text(r)).toContain('mail: no such message');
    expect(r.nextState).toBeUndefined();
  });
});

describe('mail <name> opened twice before the first is stored', () => {
  it('prints the stored mailbox both times, even if the API answers differently', async () => {
    const answer = (subject: string): Response =>
      ({
        ok: true,
        json: () =>
          Promise.resolve({
            messages: [
              { counterpart: 'Facilities Desk', direction: 'in', subject, body: 'x', day: 2 },
            ],
          }),
      }) as unknown as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(answer('FIRST')).mockResolvedValueOnce(answer('SECOND')),
    );
    const state = withTorres();
    const a = await runMailCommand('mail torres', state, null);
    // Stale state: the first mailbox is not stored yet.
    const b = await runMailCommand('mail torres', state, null);
    expect(text(b)).toBe(text(a));
    expect(b.nextState?.mailboxes['torres']).toEqual(a.nextState?.mailboxes['torres']);
    const stored = a.nextState as GameState;
    const read = await runMailCommand('mail read 1', stored, 'torres');
    expect(text(b)).toContain(`${String(stored.mailboxes['torres'].messages.length)} messages,`);
    expect(text(read)).toBe(`Read: ${stored.mailboxes['torres'].messages[0].subject}`);
  });
});
