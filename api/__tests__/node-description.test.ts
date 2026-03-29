import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../node-description.js';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    body: {
      nodeId: 'filler_01',
      template: 'workstation',
      division: 'ops',
      label: 'WORKSTATION-01',
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

const FALLBACK = 'You have connected to an unidentified host. System metadata is unavailable.';

beforeEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

afterEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

describe('POST /api/node-description — method guard', () => {
  it('should return 405 for GET requests', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
    expect((res._json as any).error).toBe('Method not allowed');
  });

  it('should return 405 for DELETE requests', async () => {
    const req = makeReq({ method: 'DELETE' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});

describe('POST /api/node-description — validation', () => {
  it('should return 400 when body is not an object', async () => {
    const req = makeReq({ body: 'not an object' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('Request body');
  });

  it('should return 400 when body is null', async () => {
    const req = makeReq({ body: null });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('should return 400 when nodeId is missing', async () => {
    const req = makeReq({ body: { template: 'workstation', division: 'ops', label: 'WS-01' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('nodeId');
  });

  it('should return 400 when template is missing', async () => {
    const req = makeReq({ body: { nodeId: 'filler_01', division: 'ops', label: 'WS-01' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('template');
  });

  it('should return 400 when division is missing', async () => {
    const req = makeReq({ body: { nodeId: 'filler_01', template: 'workstation', label: 'WS-01' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('division');
  });

  it('should return 400 when label is missing', async () => {
    const req = makeReq({
      body: { nodeId: 'filler_01', template: 'workstation', division: 'ops' },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('label');
  });

  it('should return 400 when nodeId is an empty string', async () => {
    const req = makeReq({
      body: { nodeId: '', template: 'workstation', division: 'ops', label: 'WS-01' },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

describe('POST /api/node-description — no API key', () => {
  it('should return 200 with fallback description when GEMINI_API_KEY is not set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe(FALLBACK);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/node-description — with API key', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
  });

  it('should return 200 with generated description when Gemini succeeds', async () => {
    const generated = 'You stand at a mid-tier workstation in the ops division.';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [{ content: { parts: [{ text: `  ${generated}  ` }] } }],
        }),
      }),
    );

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    // Handler trims the text
    expect((res._json as any).description).toBe(generated);
  });

  it('should return 200 with fallback when Gemini returns a non-ok HTTP status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('rate limited'),
      }),
    );

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe(FALLBACK);
  });

  it('should return 200 with fallback when candidates array is empty', async () => {
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
    expect((res._json as any).description).toBe(FALLBACK);
  });

  it('should return 200 with fallback when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe(FALLBACK);
  });

  it('should include ariaInfluence instruction in the prompt when ariaInfluence is > 0', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({ body: { ...makeReq().body, ariaInfluence: 0.7 } });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('Aria');
    expect(promptText).toContain('0.70');
  });

  it('should NOT include aria instruction in the prompt when ariaInfluence is 0', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({ body: { ...makeReq().body, ariaInfluence: 0 } });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).not.toContain('Aria');
  });

  it('should send the request to the Gemini API URL with the key as a query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('key=test-gemini-key');
  });

  it('should include nodeId, template, division, and label in the Gemini prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: {
        nodeId: 'db_server_09',
        template: 'database_server',
        division: 'finance',
        label: 'DB SERVER 09',
      },
    });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('db_server_09');
    expect(promptText).toContain('database_server');
    expect(promptText).toContain('finance');
    expect(promptText).toContain('DB SERVER 09');
  });
});
