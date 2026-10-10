import { afterEach, describe, it, expect, vi } from 'vitest';
import { ensureMailbox, markMailRead } from './mailClient';
import type { MailOwner } from './mail';
import { createInitialState } from './state';
import type { Mailbox } from '../types/mail';

const TORRES: MailOwner = {
  id: 'torres',
  name: 'Elena Torres',
  role: 'Executive assistant',
  division: null,
  credentialId: 'cred_exec_assistant',
  username: 'e.torres',
  workstationId: null,
};

const EMP: MailOwner = {
  id: 'emp_ops_001',
  name: 'Dana Whitfield',
  role: 'Facilities Coordinator',
  division: 'operations',
  credentialId: 'cred_emp_ops_001',
  username: 'dana.whitfield',
  workstationId: null,
};

const okResponse = (body: object) => ({ ok: true, json: vi.fn().mockResolvedValue(body) });

const GENERATED = {
  messages: [
    { counterpart: 'HR', direction: 'in', subject: 's1', body: 'b1', day: 2 },
    { counterpart: 'Team', direction: 'out', subject: 's2', body: 'b2', day: 4 },
  ],
};

const boxOf = (state: { mailboxes: object }, id: string): Mailbox =>
  (state.mailboxes as Record<string, Mailbox>)[id];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ensureMailbox', () => {
  it('stores the generated mail, merged after authored mail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(GENERATED)));
    const box = boxOf(await ensureMailbox(createInitialState(3), TORRES), 'torres');
    expect(box.messages.map(m => m.id)).toContain('auth_torres_1');
    expect(box.messages.some(m => m.source === 'generated')).toBe(true);
  });

  it('builds ids, from and to from the direction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(GENERATED)));
    const box = boxOf(await ensureMailbox(createInitialState(3), EMP), EMP.id);
    expect(box.messages).toEqual([
      expect.objectContaining({
        id: 'gen_emp_ops_001_0',
        from: 'HR',
        to: 'Dana Whitfield',
        sentAt: '2024-10-02',
      }),
      expect.objectContaining({
        id: 'gen_emp_ops_001_1',
        from: 'Dana Whitfield',
        to: 'Team',
        sentAt: '2024-10-04',
      }),
    ]);
  });

  it('returns the same state when the mailbox already exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(GENERATED));
    vi.stubGlobal('fetch', fetchMock);
    const once = await ensureMailbox(createInitialState(3), EMP);
    fetchMock.mockClear();
    const twice = await ensureMailbox(once, EMP);
    expect(twice).toBe(once);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unavailable', () => vi.fn().mockResolvedValue(okResponse({ unavailable: true }))],
    ['HTTP 500', () => vi.fn().mockResolvedValue({ ok: false, json: vi.fn() })],
    ['an empty list', () => vi.fn().mockResolvedValue(okResponse({ messages: [] }))],
    ['no messages field', () => vi.fn().mockResolvedValue(okResponse({ foo: 1 }))],
    ['a network error', () => vi.fn().mockRejectedValue(new Error('network'))],
  ])('falls back on %s', async (_label, makeFetch) => {
    vi.stubGlobal('fetch', makeFetch());
    const box = boxOf(await ensureMailbox(createInitialState(3), EMP), EMP.id);
    expect(box.messages.length).toBeGreaterThanOrEqual(3);
    expect(box.messages.every(m => m.source === 'fallback')).toBe(true);
  });

  it('shares one request between concurrent calls for the same owner', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(GENERATED));
    vi.stubGlobal('fetch', fetchMock);
    const state = createInitialState(3);
    const [a, b] = await Promise.all([ensureMailbox(state, EMP), ensureMailbox(state, EMP)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(boxOf(a, EMP.id)).toEqual(boxOf(b, EMP.id));
  });

  it('sends the name flag and no traits', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ unavailable: true }));
    vi.stubGlobal('fetch', fetchMock);
    await ensureMailbox(createInitialState(3), EMP);
    const init = fetchMock.mock.calls[0][1] as { body: string };
    const seen = JSON.parse(init.body) as Record<string, unknown>;
    expect(seen['ariaNameKnown']).toBe(false);
    expect(seen['ownerName']).toBe('Dana Whitfield');
    expect(init.body).not.toContain('traits');
  });
});

describe('markMailRead', () => {
  it('adds new ids once and keeps the reference when nothing is new', () => {
    const state = createInitialState(3);
    const a = markMailRead(state, ['m1', 'm2']);
    expect(a.mailRead).toEqual(['m1', 'm2']);
    expect(markMailRead(a, ['m1'])).toBe(a);
    expect(markMailRead(a, ['m2', 'm3']).mailRead).toEqual(['m1', 'm2', 'm3']);
  });
});
