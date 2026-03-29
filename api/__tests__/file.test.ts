import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../file.js';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    body: { nodeId: 'node-alpha', fileName: 'config.cfg' },
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

const FALLBACK = '[FILE CONTENT UNAVAILABLE — AI generation offline. Raw binary data suppressed.]';

beforeEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

afterEach(() => {
  delete process.env['GEMINI_API_KEY'];
  vi.unstubAllGlobals();
});

describe('POST /api/file — method guard', () => {
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

describe('POST /api/file — validation', () => {
  it('should return 400 when body is not an object', async () => {
    const req = makeReq({ body: 'just a string' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('Request body');
  });

  it('should return 400 when nodeId is missing', async () => {
    const req = makeReq({ body: { fileName: 'readme.txt' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('nodeId');
  });

  it('should return 400 when nodeId is empty', async () => {
    const req = makeReq({ body: { nodeId: '', fileName: 'readme.txt' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('nodeId');
  });

  it('should return 400 when fileName is missing', async () => {
    const req = makeReq({ body: { nodeId: 'node-alpha' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('fileName');
  });

  it('should return 400 when fileName is empty', async () => {
    const req = makeReq({ body: { nodeId: 'node-alpha', fileName: '' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('fileName');
  });

  it('should return 400 when fileName is whitespace only', async () => {
    const req = makeReq({ body: { nodeId: 'node-alpha', fileName: '   ' } });
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
    const req = makeReq({ body: ['node-alpha', 'file.txt'] });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

describe('POST /api/file — no API key', () => {
  it('should return 200 with fallback when GEMINI_API_KEY is not set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).content).toBe(FALLBACK);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/file — with API key', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
  });

  it('should return 200 with generated content when fetch succeeds', async () => {
    const fileContent = 'LOG_LEVEL=debug\nHOST=0.0.0.0\nPORT=4000';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [{ content: { parts: [{ text: `  ${fileContent}  ` }] } }],
        }),
      }),
    );

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).content).toBe(fileContent);
  });

  it('should append the API key as a query param in the Gemini URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
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

  it('should include nodeId, fileName, and fileType in the prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'content' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { nodeId: 'vault-01', fileName: 'keys.pem', fileType: 'certificate' },
    });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('vault-01');
    expect(promptText).toContain('keys.pem');
    expect(promptText).toContain('certificate');
  });

  it('should use "unknown" as fileType when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'content' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('unknown');
  });

  it('should return 200 with fallback when fetch returns non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      }),
    );

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).content).toBe(FALLBACK);
  });

  it('should return 200 with fallback when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection reset')));

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).content).toBe(FALLBACK);
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
    expect((res._json as any).content).toBe(FALLBACK);
  });

  it('should include the Aria instruction in the prompt when ariaPlanted is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { nodeId: 'aria-node', fileName: 'secret.cfg', ariaPlanted: true },
    });
    const res = makeRes() as any;
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('Aria');
  });

  it('should NOT include the Aria instruction in the prompt when ariaPlanted is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { nodeId: 'plain-node', fileName: 'config.txt', ariaPlanted: false },
    });
    const res = makeRes() as any;
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).not.toContain('Aria');
  });

  it('should include filePath in the prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { nodeId: 'node-alpha', fileName: 'config.cfg', filePath: '/etc/app/config.cfg' },
    });
    const res = makeRes() as any;
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('/etc/app/config.cfg');
  });

  it('should include ownerLabel in the prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { nodeId: 'node-alpha', fileName: 'config.cfg', ownerLabel: 'FINANCE SERVER' },
    });
    const res = makeRes() as any;
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('FINANCE SERVER');
  });

  it('should include ownerTemplate in the prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { nodeId: 'node-alpha', fileName: 'config.cfg', ownerTemplate: 'database_server' },
    });
    const res = makeRes() as any;
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('database_server');
  });

  it('should include division in the prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'generated' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = makeReq({
      body: { nodeId: 'node-alpha', fileName: 'config.cfg', division: 'security' },
    });
    const res = makeRes() as any;
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('security');
  });
});
