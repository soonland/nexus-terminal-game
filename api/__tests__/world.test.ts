import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../world.js'

// Minimal mock for VercelRequest / VercelResponse
function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    body: { prompt: 'What is node alpha?' },
    ...overrides,
  } as any
}

function makeRes() {
  const res = {
    _status: 200,
    _json: undefined as unknown,
    status(code: number) {
      res._status = code
      return res
    },
    json(data: unknown) {
      res._json = data
      return res
    },
  }
  return res
}

const FALLBACK = '[World AI unavailable — operating in offline mode. Try basic commands.]'

beforeEach(() => {
  delete process.env['GROQ_API_KEY']
  vi.unstubAllGlobals()
})

afterEach(() => {
  delete process.env['GROQ_API_KEY']
  vi.unstubAllGlobals()
})

describe('POST /api/world — method guard', () => {
  it('should return 405 for GET requests', async () => {
    const req = makeReq({ method: 'GET' })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(405)
    expect((res._json as any).error).toBe('Method not allowed')
  })

  it('should return 405 for PUT requests', async () => {
    const req = makeReq({ method: 'PUT' })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(405)
  })
})

describe('POST /api/world — validation', () => {
  it('should return 400 when body is not an object', async () => {
    const req = makeReq({ body: 'a plain string' })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect((res._json as any).error).toContain('Request body')
  })

  it('should return 400 when prompt field is missing', async () => {
    const req = makeReq({ body: { context: 'some context' } })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect((res._json as any).error).toContain('prompt')
  })

  it('should return 400 when prompt is an empty string', async () => {
    const req = makeReq({ body: { prompt: '' } })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect((res._json as any).error).toContain('prompt')
  })

  it('should return 400 when prompt is whitespace only', async () => {
    const req = makeReq({ body: { prompt: '   ' } })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
  })

  it('should return 400 when body is null', async () => {
    const req = makeReq({ body: null })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
  })

  it('should return 400 when body is an array', async () => {
    const req = makeReq({ body: [] })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
  })
})

describe('POST /api/world — no API key', () => {
  it('should return 200 with fallback when GROQ_API_KEY is not set', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect((res._json as any).response).toBe(FALLBACK)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/world — with API key', () => {
  beforeEach(() => {
    process.env['GROQ_API_KEY'] = 'test-groq-key'
  })

  it('should return 200 with AI response when fetch succeeds', async () => {
    const aiText = 'Node alpha is an entry point to the network.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: `  ${aiText}  ` } }],
      }),
    }))

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect((res._json as any).response).toBe(aiText)
  })

  it('should call the Groq API URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('groq.com')
    expect(init.headers['Authorization']).toBe('Bearer test-groq-key')
  })

  it('should include the context in the system message when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const req = makeReq({ body: { prompt: 'scan node', context: 'layer 2 node' } })
    const res = makeRes()
    await handler(req, res)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    const systemMessage = body.messages.find((m: any) => m.role === 'system')
    expect(systemMessage.content).toContain('layer 2 node')
  })

  it('should return 200 with fallback when fetch returns non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }))

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect((res._json as any).response).toBe(FALLBACK)
  })

  it('should return 200 with fallback when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect((res._json as any).response).toBe(FALLBACK)
  })

  it('should return 200 with fallback when API response has no choices', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ choices: [] }),
    }))

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect((res._json as any).response).toBe(FALLBACK)
  })
})
