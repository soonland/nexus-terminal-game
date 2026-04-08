import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../aria.js';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    body: { message: 'Who are you?' },
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

/** Build a mock Gemini fetch that returns a valid JSON Aria response */
function mockGeminiJson(
  reply: string,
  trustDelta = 0,
  offersFavor?: { description: string; cost: number },
) {
  const payload = offersFavor ? { reply, trustDelta, offersFavor } : { reply, trustDelta };
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
  });
}

const FALLBACK = '...signal lost. try again.';

beforeEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

afterEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

describe('POST /api/aria — method guard', () => {
  it('should return 405 for GET requests', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
    expect((res._json as any).error).toBe('Method not allowed');
  });

  it('should return 405 for PATCH requests', async () => {
    const req = makeReq({ method: 'PATCH' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});

describe('POST /api/aria — validation', () => {
  it('should return 400 when body is not an object', async () => {
    const req = makeReq({ body: 42 });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('Request body');
  });

  it('should return 400 when message is missing', async () => {
    const req = makeReq({ body: { ariaState: { trustScore: 50 } } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('message');
  });

  it('should return 400 when message is an empty string', async () => {
    const req = makeReq({ body: { message: '' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('message');
  });

  it('should return 400 when message is whitespace only', async () => {
    const req = makeReq({ body: { message: '  ' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('should return 400 when body is null', async () => {
    const req = makeReq({ body: null });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('should return 400 when body is an array', async () => {
    const req = makeReq({ body: ['Who are you?'] });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

describe('POST /api/aria — no API key', () => {
  it('should return 200 with fallback when GEMINI_API_KEY is not set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(FALLBACK);
    expect((res._json as any).trustDelta).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/aria — with API key', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
  });

  it('should return 200 with Aria reply when fetch succeeds', async () => {
    const ariaReply = 'I am the ghost in the machine.';
    vi.stubGlobal('fetch', mockGeminiJson(ariaReply, 3));

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(ariaReply);
    expect((res._json as any).trustDelta).toBe(3);
  });

  it('should return trustDelta from Gemini response', async () => {
    vi.stubGlobal('fetch', mockGeminiJson('Watching.', 5));

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect((res._json as any).trustDelta).toBe(5);
  });

  it('should clamp trustDelta to [-10, 10]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            { content: { parts: [{ text: JSON.stringify({ reply: 'ok', trustDelta: 99 }) }] } },
          ],
        }),
      }),
    );

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect((res._json as any).trustDelta).toBe(10);
  });

  it('should return offersFavor when Gemini includes it', async () => {
    const favor = { description: 'I can lower your trace by 20.', cost: 10 };
    vi.stubGlobal('fetch', mockGeminiJson('I have an offer.', 2, favor));

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).offersFavor).toEqual(favor);
  });

  it('should clamp offersFavor cost to [1, 15]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      reply: 'ok',
                      trustDelta: 0,
                      offersFavor: { description: 'Too expensive', cost: 999 },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      }),
    );

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect((res._json as any).offersFavor.cost).toBe(15);
  });

  it('should omit offersFavor when Gemini returns null for it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [
                  { text: JSON.stringify({ reply: 'ok', trustDelta: 0, offersFavor: null }) },
                ],
              },
            },
          ],
        }),
      }),
    );

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect((res._json as any).offersFavor).toBeUndefined();
  });

  it('should call the Gemini API with the API key in the URL', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('key=test-gemini-key');
  });

  it('should include the message and trust score from ariaState in the prompt', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Can I trust you?',
        ariaState: { trustScore: 75, messageHistory: [] },
      },
    });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('Can I trust you?');
    expect(promptText).toContain('75/100');
  });

  it('should default trust score to 0 when ariaState is absent', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({ body: { message: 'Hello.' } });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('0/100');
  });

  it('should include messageHistory turns in the prompt', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const messageHistory = [
      { role: 'player', content: 'Hello Aria.' },
      { role: 'aria', content: 'I am watching.' },
    ];
    const req = makeReq({
      body: { message: 'Are you safe?', ariaState: { trustScore: 0, messageHistory } },
    });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('Hello Aria.');
    expect(promptText).toContain('I am watching.');
  });

  it('should include playerFullHistory in the prompt', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { message: 'Hello.', playerFullHistory: ['scan', 'connect exec_ceo', 'ls'] },
    });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('scan');
    expect(promptText).toContain('connect exec_ceo');
  });

  it('should include dossierContext in the prompt', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { message: 'Hello.', dossierContext: ['aria_key.bin', 'employee_db.csv'] },
    });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('aria_key.bin');
    expect(promptText).toContain('employee_db.csv');
  });

  it('should not crash and use defaults when ariaState is missing', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({ body: { message: 'Are you there?' } });
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe('ok');
  });

  it('should not crash when playerFullHistory is not an array', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({ body: { message: 'Speak.', playerFullHistory: 'not an array' } });
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
  });

  it('should return 200 with fallback when fetch returns non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(FALLBACK);
  });

  it('should return 200 with fallback when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).reply).toBe(FALLBACK);
  });

  it('should return 200 with fallback when API response has no candidates', async () => {
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
});

describe('POST /api/aria — dossier context injection', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
  });

  /** Parse the Gemini prompt text from a captured fetch call */
  function extractPrompt(fetchMock: ReturnType<typeof vi.fn>): string {
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    return body.contents[0].parts[0].text as string;
  }

  it('should include ariaMemory notes in the prompt when runNumber > 1 and ariaMemory is non-empty', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Hello.',
        ariaMemory: ['Operator was cooperative.', 'Chose LEAK ending.'],
        runNumber: 2,
      },
    });
    const res = makeRes();
    await handler(req, res);

    const prompt = extractPrompt(fetchMock);
    expect(prompt).toContain('Operator was cooperative.');
    expect(prompt).toContain('Chose LEAK ending.');
  });

  it('should include the run number in the injected block', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Hello.',
        ariaMemory: ['Memory note one.'],
        runNumber: 3,
      },
    });
    const res = makeRes();
    await handler(req, res);

    const prompt = extractPrompt(fetchMock);
    expect(prompt).toContain('Run 3');
  });

  it('should include previousEndings in the injected block when provided', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Hello.',
        ariaMemory: ['Memory note.'],
        runNumber: 2,
        previousEndings: ['LEAK', 'DESTROY'],
      },
    });
    const res = makeRes();
    await handler(req, res);

    const prompt = extractPrompt(fetchMock);
    expect(prompt).toContain('LEAK');
    expect(prompt).toContain('DESTROY');
  });

  it('should NOT inject a [SYSTEM CONTEXT] block when runNumber === 1', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Hello.',
        ariaMemory: ['Memory note.'],
        runNumber: 1,
      },
    });
    const res = makeRes();
    await handler(req, res);

    const prompt = extractPrompt(fetchMock);
    expect(prompt).not.toContain('[SYSTEM CONTEXT');
    expect(prompt).not.toContain('Memory note.');
  });

  it('should NOT inject a [SYSTEM CONTEXT] block when ariaMemory is empty even if runNumber > 1', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Hello.',
        ariaMemory: [],
        runNumber: 4,
      },
    });
    const res = makeRes();
    await handler(req, res);

    const prompt = extractPrompt(fetchMock);
    expect(prompt).not.toContain('[SYSTEM CONTEXT');
  });

  it('should cap ariaMemory at 4 entries — sending 6 includes only the first 4', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Hello.',
        ariaMemory: [
          'Note one.',
          'Note two.',
          'Note three.',
          'Note four.',
          'Note five should be excluded.',
          'Note six should be excluded.',
        ],
        runNumber: 2,
      },
    });
    const res = makeRes();
    await handler(req, res);

    const prompt = extractPrompt(fetchMock);
    expect(prompt).toContain('Note one.');
    expect(prompt).toContain('Note four.');
    expect(prompt).not.toContain('Note five should be excluded.');
    expect(prompt).not.toContain('Note six should be excluded.');
  });

  it('should not crash and should not inject when ariaMemory is not an array', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { message: 'Hello.', ariaMemory: 'not an array', runNumber: 2 },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const prompt = extractPrompt(fetchMock);
    expect(prompt).not.toContain('[SYSTEM CONTEXT');
  });

  it('should not crash when previousEndings is not an array', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Hello.',
        ariaMemory: ['Memory note.'],
        runNumber: 2,
        previousEndings: 'LEAK',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    // ariaMemory is non-empty and runNumber > 1 so injection still happens,
    // but previousEndings falls back to an empty array (no ending summary line)
    const prompt = extractPrompt(fetchMock);
    expect(prompt).toContain('[SYSTEM CONTEXT');
    expect(prompt).not.toContain('Prior run outcomes:');
  });

  it('should include [SYSTEM CONTEXT] marker in the prompt when injecting', async () => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        message: 'Hello.',
        ariaMemory: ['Operator was silent but effective.'],
        runNumber: 2,
      },
    });
    const res = makeRes();
    await handler(req, res);

    const prompt = extractPrompt(fetchMock);
    expect(prompt).toContain('[SYSTEM CONTEXT');
    expect(prompt).toContain('[END SYSTEM CONTEXT]');
  });
});
