import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../sentinel.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    body: {
      message: 'Who are you?',
      sentinelContext: {
        traceLevel: 10,
        currentNodeId: 'test_node',
        currentLayer: 0,
        recentCommands: [],
      },
    },
    ...overrides,
  } as any;
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

/** Build a mock fetch that returns a valid Gemini response wrapping the given payload JSON. */
function mockGeminiOk(payloadJson: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: payloadJson }] } }],
    }),
    text: vi.fn().mockResolvedValue(payloadJson),
  });
}

function mockGeminiHttpError(status = 500) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: vi.fn().mockResolvedValue('Internal Server Error'),
    json: vi.fn().mockResolvedValue({}),
  });
}

const FALLBACK = '...transmission interrupted.';

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

afterEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

// ── Method guard ──────────────────────────────────────────────────────────────

describe('POST /api/sentinel — method guard', () => {
  it('should return 405 for GET requests', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
    expect((res._json as any).error).toBe('Method not allowed');
  });

  it('should return 405 for PUT requests', async () => {
    const req = makeReq({ method: 'PUT' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('POST /api/sentinel — validation', () => {
  it('should return 400 when body is not an object', async () => {
    const req = makeReq({ body: 'not-an-object' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toBeDefined();
  });

  it('should return 400 when body is an array', async () => {
    const req = makeReq({ body: [] });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('should return 400 when message field is missing', async () => {
    const req = makeReq({ body: { sentinelContext: {} } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toMatch(/message/i);
  });

  it('should return 400 when message is not a string (number)', async () => {
    const req = makeReq({ body: { message: 42, sentinelContext: {} } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('should return 400 when message is an empty string', async () => {
    const req = makeReq({ body: { message: '   ', sentinelContext: {} } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

// ── Missing API key ───────────────────────────────────────────────────────────

describe('POST /api/sentinel — missing GEMINI_API_KEY', () => {
  it('should return 200 with fallback reply when GEMINI_API_KEY is not set', async () => {
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(FALLBACK);
  });

  it('should not call fetch when GEMINI_API_KEY is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Gemini HTTP error ─────────────────────────────────────────────────────────

describe('POST /api/sentinel — Gemini HTTP error', () => {
  it('should return 200 with fallback reply when Gemini returns a non-ok status', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    vi.stubGlobal('fetch', mockGeminiHttpError(503));
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(FALLBACK);
  });
});

// ── Gemini empty candidates ───────────────────────────────────────────────────

describe('POST /api/sentinel — Gemini empty candidates', () => {
  it('should return 200 with fallback when candidates array is empty', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ candidates: [] }),
      }),
    );
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(FALLBACK);
  });

  it('should return 200 with fallback when candidates is missing entirely', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      }),
    );
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(FALLBACK);
  });
});

// ── Successful Gemini response ────────────────────────────────────────────────

describe('POST /api/sentinel — successful Gemini response', () => {
  it('should return 200 with the reply extracted from Gemini JSON', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const replyText = 'Ghost. Your intrusion is noted.';
    vi.stubGlobal('fetch', mockGeminiOk(JSON.stringify({ reply: replyText })));
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(replyText);
  });

  it('should return fallback reply when "reply" field is missing in parsed JSON', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    vi.stubGlobal('fetch', mockGeminiOk(JSON.stringify({ other: 'data' })));
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(FALLBACK);
  });

  it('should handle Gemini response wrapped in markdown code fences', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const replyText = 'I see you, Ghost.';
    const fenced = '```json\n' + JSON.stringify({ reply: replyText }) + '\n```';
    vi.stubGlobal('fetch', mockGeminiOk(fenced));
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(replyText);
  });

  it('should return fallback when fetch throws unexpectedly', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(FALLBACK);
  });
});

// ── traceLevel >= 61 uses HIGH_THREAT prompt ──────────────────────────────────

describe('POST /api/sentinel — prompt selection', () => {
  it('should use high-threat prompt when traceLevel is 61 (returns valid reply shape)', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const replyText = 'Your time is running out, Ghost.';
    vi.stubGlobal('fetch', mockGeminiOk(JSON.stringify({ reply: replyText })));
    const req = makeReq({
      body: {
        message: 'Still here.',
        sentinelContext: {
          traceLevel: 61,
          currentNodeId: 'deep_node',
          currentLayer: 3,
          recentCommands: [],
        },
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(replyText);
  });

  it('should use standard prompt when traceLevel is 60 (returns valid reply shape)', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const replyText = 'Curious behaviour, Ghost.';
    vi.stubGlobal('fetch', mockGeminiOk(JSON.stringify({ reply: replyText })));
    const req = makeReq({
      body: {
        message: 'Just looking.',
        sentinelContext: {
          traceLevel: 60,
          currentNodeId: 'mid_node',
          currentLayer: 2,
          recentCommands: [],
        },
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(replyText);
  });
});

// ── messageHistory slicing ────────────────────────────────────────────────────

describe('POST /api/sentinel — messageHistory slicing', () => {
  it('should send at most the last 20 history entries to Gemini', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const fetchMock = mockGeminiOk(JSON.stringify({ reply: 'Acknowledged.' }));
    vi.stubGlobal('fetch', fetchMock);

    // Build 30 history entries — only the last 20 should be used
    const messageHistory = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'player' : 'sentinel',
      content: `message ${String(i)}`,
    }));

    const req = makeReq({ body: { message: 'Still here.', sentinelContext: {}, messageHistory } });
    const res = makeRes();
    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(options.body as string) as {
      contents: { parts: { text: string }[] }[];
    };
    const prompt = sentBody.contents[0].parts[0].text;

    // The last 20 messages are entries 10-29; entry 9 should NOT appear in the prompt
    expect(prompt).toContain('message 29');
    expect(prompt).not.toContain('message 9');
  });
});

// ── triggerContext included in prompt ─────────────────────────────────────────

describe('POST /api/sentinel — triggerContext', () => {
  it('should include a description of triggerContext.type in the prompt when provided', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const fetchMock = mockGeminiOk(JSON.stringify({ reply: 'Noted, Ghost.' }));
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Hello.',
        sentinelContext: {
          traceLevel: 10,
          currentNodeId: 'test_node',
          currentLayer: 0,
          recentCommands: [],
        },
        triggerContext: { type: 'exploit' },
      },
    });
    const res = makeRes();
    await handler(req, res);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(options.body as string) as {
      contents: { parts: { text: string }[] }[];
    };
    const prompt = sentBody.contents[0].parts[0].text;

    // The handler maps 'exploit' to a description — verify the description appears
    expect(prompt).toContain('exploit');
  });

  it('should include trace_31 trigger description when triggerContext.type is "trace_31"', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const fetchMock = mockGeminiOk(JSON.stringify({ reply: 'Watching you.' }));
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'I see the threshold.',
        sentinelContext: {
          traceLevel: 31,
          currentNodeId: 'test_node',
          currentLayer: 0,
          recentCommands: [],
        },
        triggerContext: { type: 'trace_31' },
      },
    });
    const res = makeRes();
    await handler(req, res);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(options.body as string) as {
      contents: { parts: { text: string }[] }[];
    };
    const prompt = sentBody.contents[0].parts[0].text;

    expect(prompt).toContain('Trigger context');
    expect(prompt).toContain('watchlist');
  });

  it('should not include trigger context line when triggerContext is absent', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const fetchMock = mockGeminiOk(JSON.stringify({ reply: 'Quiet.' }));
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(options.body as string) as {
      contents: { parts: { text: string }[] }[];
    };
    const prompt = sentBody.contents[0].parts[0].text;

    expect(prompt).not.toContain('Trigger context');
  });
});
