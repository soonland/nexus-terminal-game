import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../node-description.js';

const DEFAULT_BODY = {
  nodeId: 'filler_01',
  template: 'workstation',
  division: 'ops',
  label: 'WORKSTATION-01',
};

async function callHandler(
  overrides: { method?: string; body?: unknown } = {},
): Promise<{ _status: number; _json: unknown }> {
  const { method = 'POST', body = DEFAULT_BODY } = overrides;
  const init: RequestInit = { method };
  if (method === 'POST') {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await app.request('/', init);
  const _json = await res.json().catch(() => undefined);
  return { _status: res.status, _json };
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
    const res = await callHandler({ method: 'GET' });
    expect(res._status).toBe(405);
    expect((res._json as any).error).toBe('Method not allowed');
  });

  it('should return 405 for DELETE requests', async () => {
    const res = await callHandler({ method: 'DELETE' });
    expect(res._status).toBe(405);
  });
});

describe('POST /api/node-description — validation', () => {
  it('should return 400 when body is not an object', async () => {
    const res = await callHandler({ body: 'not an object' });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('Request body');
  });

  it('should return 400 when body is null', async () => {
    const res = await callHandler({ body: null });
    expect(res._status).toBe(400);
  });

  it('should return 400 when nodeId is missing', async () => {
    const res = await callHandler({
      body: { template: 'workstation', division: 'ops', label: 'WS-01' },
    });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('nodeId');
  });

  it('should return 400 when template is missing', async () => {
    const res = await callHandler({
      body: { nodeId: 'filler_01', division: 'ops', label: 'WS-01' },
    });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('template');
  });

  it('should return 400 when division is missing', async () => {
    const res = await callHandler({
      body: { nodeId: 'filler_01', template: 'workstation', label: 'WS-01' },
    });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('division');
  });

  it('should return 400 when label is missing', async () => {
    const res = await callHandler({
      body: { nodeId: 'filler_01', template: 'workstation', division: 'ops' },
    });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('label');
  });

  it('should return 400 when nodeId is an empty string', async () => {
    const res = await callHandler({
      body: { nodeId: '', template: 'workstation', division: 'ops', label: 'WS-01' },
    });
    expect(res._status).toBe(400);
  });
});

describe('POST /api/node-description — no API key', () => {
  it('should return 200 with fallback description when GEMINI_API_KEY is not set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await callHandler();

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

    const res = await callHandler();

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

    const res = await callHandler();

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

    const res = await callHandler();

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe(FALLBACK);
  });

  it('should return 200 with fallback when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

    const res = await callHandler();

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

    await callHandler({ body: { ...DEFAULT_BODY, ariaInfluence: 0.7 } });

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

    await callHandler({ body: { ...DEFAULT_BODY, ariaInfluence: 0 } });

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

    await callHandler();

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

    await callHandler({
      body: {
        nodeId: 'db_server_09',
        template: 'database_server',
        division: 'finance',
        label: 'DB SERVER 09',
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const promptText = body.contents[0].parts[0].text;
    expect(promptText).toContain('db_server_09');
    expect(promptText).toContain('database_server');
    expect(promptText).toContain('finance');
    expect(promptText).toContain('DB SERVER 09');
  });
});
