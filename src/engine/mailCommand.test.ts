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
  it('opens an unlocked mailbox, stores it and lists numbered messages', async () => {
    const r = await runMailCommand('mail torres', withTorres(), null);
    expect(r.ownerId).toBe('torres');
    expect(r.showTab).toBe(true);
    expect(r.nextState?.mailboxes['torres']).toBeDefined();
    expect(text(r)).toMatch(/\s1\. \[\*\] 2024-10-/);
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

  it('prints the message and marks it read', async () => {
    const opened = await runMailCommand('mail torres', withTorres(), null);
    const state = opened.nextState as GameState;
    const r = await runMailCommand('mail read 1', state, 'torres');
    expect(text(r)).toContain('Subject:');
    const first = state.mailboxes['torres'].messages[0];
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
    const listed = text(b).split('\n')[1] ?? '';
    expect(listed).toContain(stored.mailboxes['torres'].messages[0].subject);
    expect(text(read)).toContain(`Subject: ${stored.mailboxes['torres'].messages[0].subject}`);
  });
});
