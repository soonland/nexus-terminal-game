import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../camera-feed.js';

async function callHandler(
  overrides: { method?: string; body?: unknown } = {},
): Promise<{ _status: number; _json: unknown }> {
  const { method = 'POST', body = { cameraId: 'cam_01', location: 'lobby' } } = overrides;
  const init: RequestInit = { method };
  if (method === 'POST') {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await app.request('/', init);
  const _json = await res.json().catch(() => undefined);
  return { _status: res.status, _json };
}

const FALLBACK = 'FEED DEGRADED — signal lost';

beforeEach(() => {
  delete process.env['GEMINI_API_KEY'];
  delete process.env['ARIA_AI_API_KEY'];
  vi.unstubAllGlobals();
});

afterEach(() => {
  delete process.env['GEMINI_API_KEY'];
  delete process.env['ARIA_AI_API_KEY'];
  vi.unstubAllGlobals();
});

describe('POST /api/camera-feed — method guard', () => {
  it('should return 405 for GET requests', async () => {
    const res = await callHandler({ method: 'GET' });
    expect(res._status).toBe(405);
    expect((res._json as any).error).toBe('Method not allowed');
  });
});

describe('POST /api/camera-feed — validation', () => {
  it('should return 400 when body is not an object', async () => {
    const res = await callHandler({ body: 'bad' });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('Request body');
  });

  it('should return 400 when cameraId is missing', async () => {
    const res = await callHandler({ body: { location: 'lobby' } });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('cameraId');
  });

  it('should return 400 when cameraId is empty', async () => {
    const res = await callHandler({ body: { cameraId: '', location: 'lobby' } });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('cameraId');
  });

  it('should return 400 when location is missing', async () => {
    const res = await callHandler({ body: { cameraId: 'cam_01' } });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('location');
  });

  it('should return 400 when location is empty', async () => {
    const res = await callHandler({ body: { cameraId: 'cam_01', location: '' } });
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('location');
  });
});

describe('POST /api/camera-feed — missing API key', () => {
  it('should return fallback when GEMINI_API_KEY is not set', async () => {
    const res = await callHandler();
    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe(FALLBACK);
  });

  it('should use ARIA_AI_API_KEY when GEMINI_API_KEY is absent', async () => {
    process.env['ARIA_AI_API_KEY'] = 'override-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Two guards, north corridor.' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await callHandler();

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe('Two guards, north corridor.');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('override-key');
  });
});

describe('POST /api/camera-feed — Gemini success', () => {
  it('should return description from Gemini response', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Empty lobby. Motion sensor inactive.' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await callHandler();

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe('Empty lobby. Motion sensor inactive.');
  });

  it('should pass cameraId and location in the prompt', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Server racks humming.' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await callHandler({ body: { cameraId: 'cam_02', location: 'server_room' } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt: string = body.contents[0].parts[0].text;
    expect(prompt).toContain('cam_02');
    expect(prompt).toContain('server room');
  });
});

describe('POST /api/camera-feed — Gemini errors', () => {
  it('should return fallback on non-ok Gemini response', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue('service unavailable'),
      }),
    );

    const res = await callHandler();

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe(FALLBACK);
  });

  it('should return fallback when Gemini returns empty candidates', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
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

  it('should return fallback when fetch throws', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const res = await callHandler();

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe(FALLBACK);
  });
});
