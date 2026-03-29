import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../world.js';
import type { WorldAIResponse } from '../world.js';

// ── Test fixtures ──────────────────────────────────────────
const VALID_BODY = {
  command: 'look for sticky notes',
  currentNode: {
    id: 'contractor_portal',
    ip: '10.0.0.1',
    label: 'CONTRACTOR PORTAL',
    layer: 0,
    accessLevel: 'user',
    services: [{ name: 'http', port: 80, vulnerable: true }],
    files: [{ name: 'welcome.txt', type: 'document' }],
  },
  playerState: { handle: 'ghost', trace: 5, charges: 3, tools: [{ id: 'exploit-kit' }] },
  recentCommands: ['scan', 'ls'],
  turnCount: 7,
};

const FALLBACK_NARRATIVE =
  '[World AI unavailable — operating in offline mode. Try basic commands.]';

function makeReq(overrides: Record<string, unknown> = {}) {
  return { method: 'POST', body: { ...VALID_BODY }, ...overrides } as any;
}

function makeRes() {
  const res = {
    _status: 200,
    _json: undefined as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res;
}

function makeGeminiResponse(content: string) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: content }] } }],
    }),
  };
}

const VALID_AI_JSON: WorldAIResponse = {
  narrative: 'You find a sticky note with admin credentials.',
  traceChange: 1,
  accessGranted: false,
  newAccessLevel: null,
  flagsSet: { found_sticky_notes: true },
  nodesUnlocked: [],
  isUnknown: false,
};

beforeEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});
afterEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

// ── Method guard ───────────────────────────────────────────
describe('POST /api/world — method guard', () => {
  it('returns 405 for GET', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res._status).toBe(405);
    expect((res._json as any).error).toBe('Method not allowed');
  });

  it('returns 405 for PUT', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'PUT' }), res);
    expect(res._status).toBe(405);
  });
});

// ── Validation ─────────────────────────────────────────────
describe('POST /api/world — validation', () => {
  it('returns 400 when body is not an object', async () => {
    const res = makeRes();
    await handler(makeReq({ body: 'a plain string' }), res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('Request body');
  });

  it('returns 400 when command field is missing', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { currentNode: {} } }), res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('command');
  });

  it('returns 400 when command is an empty string', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { ...VALID_BODY, command: '' } }), res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('command');
  });

  it('returns 400 when body is null', async () => {
    const res = makeRes();
    await handler(makeReq({ body: null }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when body is an array', async () => {
    const res = makeRes();
    await handler(makeReq({ body: [] }), res);
    expect(res._status).toBe(400);
  });
});

// ── No API key ─────────────────────────────────────────────
describe('POST /api/world — no API key', () => {
  it('returns fallback WorldAIResponse when GROQ_API_KEY is not set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._status).toBe(200);
    const json = res._json as WorldAIResponse;
    expect(json.narrative).toBe(FALLBACK_NARRATIVE);
    expect(json.isUnknown).toBe(true);
    expect(json.traceChange).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── With API key ───────────────────────────────────────────
describe('POST /api/world — with API key', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
  });

  it('returns structured WorldAIResponse when fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeGeminiResponse(JSON.stringify(VALID_AI_JSON))),
    );

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._status).toBe(200);
    const json = res._json as WorldAIResponse;
    expect(json.narrative).toBe(VALID_AI_JSON.narrative);
    expect(json.traceChange).toBe(1);
    expect(json.isUnknown).toBe(false);
    expect(json.flagsSet).toEqual({ found_sticky_notes: true });
  });

  it('calls the Gemini API URL with key as query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse(JSON.stringify(VALID_AI_JSON)));
    vi.stubGlobal('fetch', fetchMock);

    await handler(makeReq(), makeRes());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('test-gemini-key');
  });

  it('includes node and player context in the user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse(JSON.stringify(VALID_AI_JSON)));
    vi.stubGlobal('fetch', fetchMock);

    await handler(makeReq(), makeRes());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('CONTRACTOR PORTAL');
    expect(promptText).toContain('ghost');
    expect(promptText).toContain('look for sticky notes');
  });

  it('caps traceChange to 0–5 range', async () => {
    const overLimit = { ...VALID_AI_JSON, traceChange: 99 };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeGeminiResponse(JSON.stringify(overLimit))),
    );

    const res = makeRes();
    await handler(makeReq(), res);

    expect((res._json as WorldAIResponse).traceChange).toBe(5);
  });

  it('clears newAccessLevel when accessGranted is false', async () => {
    const withAccess = { ...VALID_AI_JSON, accessGranted: false, newAccessLevel: 'admin' as const };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeGeminiResponse(JSON.stringify(withAccess))),
    );

    const res = makeRes();
    await handler(makeReq(), res);

    expect((res._json as WorldAIResponse).newAccessLevel).toBeNull();
  });

  it('returns fallback when fetch returns non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 500,
          text: vi.fn().mockResolvedValue('Internal Server Error'),
        }),
    );

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._status).toBe(200);
    expect((res._json as WorldAIResponse).narrative).toBe(FALLBACK_NARRATIVE);
  });

  it('returns fallback when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._status).toBe(200);
    expect((res._json as WorldAIResponse).narrative).toBe(FALLBACK_NARRATIVE);
  });

  it('returns fallback when AI returns no choices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ choices: [] }),
      }),
    );

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._status).toBe(200);
    expect((res._json as WorldAIResponse).narrative).toBe(FALLBACK_NARRATIVE);
  });

  it('builds prompt with minimal body (no optional fields)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse(JSON.stringify(VALID_AI_JSON)));
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await handler(makeReq({ body: { command: 'look around' } }), res);

    expect(res._status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('look around');
  });

  it('uses fallback values for missing or wrong-typed AI response fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeGeminiResponse(
          JSON.stringify({
            narrative: 42,
            traceChange: 'not a number',
            accessGranted: false,
            newAccessLevel: 'admin',
            flagsSet: 'not an object',
            nodesUnlocked: 'not an array',
            isUnknown: 'true',
          }),
        ),
      ),
    );

    const res = makeRes();
    await handler(makeReq(), res);

    const json = res._json as WorldAIResponse;
    expect(json.narrative).toBe(FALLBACK_NARRATIVE);
    expect(json.traceChange).toBe(0);
    expect(json.accessGranted).toBe(false);
    expect(json.newAccessLevel).toBeNull();
    expect(json.flagsSet).toEqual({});
    expect(json.nodesUnlocked).toEqual([]);
    expect(json.isUnknown).toBe(false);
  });

  it('returns fallback when AI response is invalid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeGeminiResponse('not valid json at all {{{')),
    );

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._status).toBe(200);
    expect((res._json as WorldAIResponse).narrative).toBe(FALLBACK_NARRATIVE);
  });
});
