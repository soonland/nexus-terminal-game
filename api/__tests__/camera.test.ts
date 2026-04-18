import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../camera-feed.js';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    body: { cameraId: 'cam_01', location: 'lobby' },
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
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
    expect((res._json as any).error).toBe('Method not allowed');
  });
});

describe('POST /api/camera-feed — validation', () => {
  it('should return 400 when body is not an object', async () => {
    const req = makeReq({ body: 'bad' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('Request body');
  });

  it('should return 400 when cameraId is missing', async () => {
    const req = makeReq({ body: { location: 'lobby' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('cameraId');
  });

  it('should return 400 when cameraId is empty', async () => {
    const req = makeReq({ body: { cameraId: '', location: 'lobby' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('cameraId');
  });

  it('should return 400 when location is missing', async () => {
    const req = makeReq({ body: { cameraId: 'cam_01' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('location');
  });

  it('should return 400 when location is empty', async () => {
    const req = makeReq({ body: { cameraId: 'cam_01', location: '' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._json as any).error).toContain('location');
  });
});

describe('POST /api/camera-feed — missing API key', () => {
  it('should return fallback when GEMINI_API_KEY is not set', async () => {
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
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

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

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

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

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

    const req = makeReq({ body: { cameraId: 'cam_02', location: 'server_room' } });
    const res = makeRes();
    await handler(req, res);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt: string = body.contents[0].parts[0].text;
    expect(prompt).toContain('cam_02');
    expect(prompt).toContain('server_room');
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

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

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

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe(FALLBACK);
  });

  it('should return fallback when fetch throws', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._json as any).description).toBe(FALLBACK);
  });
});
