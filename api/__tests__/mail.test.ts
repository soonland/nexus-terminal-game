import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app, parseMessages } from '../mail.js';

const BODY = {
  ownerName: 'Dana Whitfield',
  role: 'Facilities Coordinator',
  division: 'operations',
  workstation: 'OPS-WS-12',
  sessionSeed: 42,
  trace: 10,
  layer: 1,
  ariaNameKnown: false,
};

const post = async (body: unknown, method = 'POST') => {
  const init: RequestInit = { method };
  if (method === 'POST') {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await app.request('/', init);
  return { status: res.status, json: await res.json().catch(() => undefined) };
};

const geminiReturns = (text: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text }] } }] }),
    }),
  );

const good = (extra: object = {}) =>
  JSON.stringify({
    messages: [
      { counterpart: 'IT Operations', direction: 'in', subject: 'Reset', body: 'Done.', day: 3 },
      {
        counterpart: 'Team',
        direction: 'out',
        subject: 'Notes',
        body: 'Thanks.',
        day: 9,
        ...extra,
      },
    ],
  });

beforeEach(() => {
  process.env['GEMINI_API_KEY'] = 'test-key';
  vi.unstubAllGlobals();
});
afterEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

describe('POST /api/mail — request handling', () => {
  it('405s other methods', async () => {
    expect((await post(BODY, 'GET')).status).toBe(405);
  });

  it.each([
    ['ownerName', { ...BODY, ownerName: '' }],
    ['role', { ...BODY, role: undefined }],
    ['sessionSeed', { ...BODY, sessionSeed: 'x' }],
    ['ariaNameKnown', { ...BODY, ariaNameKnown: undefined }],
  ])('400s when %s is invalid', async (field, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.json.error).toContain(field);
  });

  it('answers unavailable when there is no API key', async () => {
    delete process.env['GEMINI_API_KEY'];
    const res = await post(BODY);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ unavailable: true });
  });
});

describe('POST /api/mail — generation', () => {
  it('returns the validated messages', async () => {
    geminiReturns(good());
    const res = await post(BODY);
    expect(res.status).toBe(200);
    expect(res.json.messages).toHaveLength(2);
    expect(res.json.messages[0]).toEqual({
      counterpart: 'IT Operations',
      direction: 'in',
      subject: 'Reset',
      body: 'Done.',
      day: 3,
    });
  });

  it('forbids the name in the prompt while it is unknown', async () => {
    geminiReturns(good());
    await post(BODY);
    const sent = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.contents[0].parts[0].text).toContain('Never write the name "Aria"');
  });

  it('answers unavailable on an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('x') }),
    );
    expect((await post(BODY)).json).toEqual({ unavailable: true });
  });

  it('answers unavailable when the model returns garbage', async () => {
    geminiReturns('not json at all');
    expect((await post(BODY)).json).toEqual({ unavailable: true });
  });

  it('answers unavailable when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect((await post(BODY)).json).toEqual({ unavailable: true });
  });
});

describe('parseMessages', () => {
  it('accepts a fenced JSON block', () => {
    expect(parseMessages('```json\n' + good() + '\n```', false)).toHaveLength(2);
  });

  it('scrubs the secret name while it is unknown, and leaves it when known', () => {
    const text = good({ body: 'Ask Aria about it.' });
    expect(parseMessages(text, false)?.[1].body).toBe('Ask Cassandra about it.');
    expect(parseMessages(text, true)?.[1].body).toBe('Ask Aria about it.');
  });

  it('rejects an empty list, a non-array and more than 8 messages', () => {
    expect(parseMessages('{"messages":[]}', false)).toBeNull();
    expect(parseMessages('{"messages":"x"}', false)).toBeNull();
    const many = Array.from({ length: 9 }, () => ({
      counterpart: 'A',
      direction: 'in',
      subject: 's',
      body: 'b',
      day: 1,
    }));
    expect(parseMessages(JSON.stringify({ messages: many }), false)).toBeNull();
  });

  it('drops invalid messages but keeps the valid ones', () => {
    const text = JSON.stringify({
      messages: [
        { counterpart: 'A', direction: 'sideways', subject: 's', body: 'b', day: 1 },
        { counterpart: 'A', direction: 'in', subject: 's', body: 'b', day: 1 },
      ],
    });
    expect(parseMessages(text, false)).toHaveLength(1);
  });

  it('clamps day into 1..25 and truncates long bodies', () => {
    const text = JSON.stringify({
      messages: [
        { counterpart: 'A', direction: 'in', subject: 's', body: 'x'.repeat(5000), day: 99 },
      ],
    });
    const out = parseMessages(text, false);
    expect(out?.[0].day).toBe(25);
    expect(out?.[0].body.length).toBeLessThanOrEqual(900);
  });

  it('rejects the whole answer if any message accuses someone or names Nexus', () => {
    expect(parseMessages(good({ body: 'The mole is in finance.' }), false)).toBeNull();
    expect(parseMessages(good({ subject: 'About Nexus' }), false)).toBeNull();
  });
});
