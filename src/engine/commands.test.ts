import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveCommand } from './commands'
import { createInitialState } from './state'
import { GameState } from '../types/game'

// ── Helpers ────────────────────────────────────────────────

function makeOkFetchResponse(body: object) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  }
}

const DEFAULT_AI_RESPONSE = {
  narrative: 'The AI responded.',
  traceChange: 0,
  accessGranted: false,
  newAccessLevel: null,
  flagsSet: {},
  nodesUnlocked: [],
  isUnknown: false,
}

// ── Tests ──────────────────────────────────────────────────

describe('resolveCommand — turn tracking', () => {
  let state: GameState

  beforeEach(() => {
    state = createInitialState()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse(DEFAULT_AI_RESPONSE)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should append the raw command to recentCommands after a local command', async () => {
    const result = await resolveCommand('help', state)
    expect(result.nextState?.recentCommands).toContain('help')
  })

  it('should append the raw command to recentCommands after an engine command', async () => {
    const result = await resolveCommand('scan', state)
    expect(result.nextState?.recentCommands).toContain('scan')
  })

  it('should append the raw command to recentCommands after an AI command', async () => {
    const result = await resolveCommand('frobnicate', state)
    expect(result.nextState?.recentCommands).toContain('frobnicate')
  })

  it('should keep only the last 8 commands when the buffer overflows', async () => {
    // Seed 8 commands manually so the 9th push causes a slice
    const seeded: GameState = {
      ...state,
      recentCommands: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
      turnCount: 8,
    }
    const result = await resolveCommand('help', seeded)
    expect(result.nextState?.recentCommands).toHaveLength(8)
    expect(result.nextState?.recentCommands).not.toContain('c1')
    expect(result.nextState?.recentCommands).toContain('help')
  })

  it('should increment turnCount by 1 after a local command', async () => {
    const result = await resolveCommand('help', state)
    expect(result.nextState?.turnCount).toBe(1)
  })

  it('should increment turnCount by 1 after an engine command', async () => {
    const result = await resolveCommand('scan', state)
    expect(result.nextState?.turnCount).toBe(1)
  })

  it('should increment turnCount by 1 after an AI command', async () => {
    const result = await resolveCommand('frobnicate', state)
    expect(result.nextState?.turnCount).toBe(1)
  })

  it('should accumulate turnCount across successive calls', async () => {
    const r1 = await resolveCommand('help', state)
    const r2 = await resolveCommand('status', r1.nextState as GameState)
    expect(r2.nextState?.turnCount).toBe(2)
  })
})

describe('resolveCommand — burned phase guard', () => {
  it('should return a SESSION TERMINATED error and no nextState when phase is burned', async () => {
    const burned: GameState = { ...createInitialState(), phase: 'burned' }
    const result = await resolveCommand('help', burned)
    expect(result.lines[0].type).toBe('error')
    expect(result.lines[0].content).toMatch(/SESSION TERMINATED/)
    expect(result.nextState).toBeUndefined()
  })
})

describe('resolveCommand — AI routing happy path', () => {
  let state: GameState

  beforeEach(() => {
    state = createInitialState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should render the narrative as an output line when isUnknown is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, narrative: 'Hello from the AI.' }),
    ))
    const result = await resolveCommand('frobnicate', state)
    const narrativeLine = result.lines.find(l => l.content === 'Hello from the AI.')
    expect(narrativeLine).toBeDefined()
    expect(narrativeLine?.type).toBe('output')
  })

  it('should apply traceChange to the player trace in nextState', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, traceChange: 5 }),
    ))
    const result = await resolveCommand('frobnicate', state)
    expect(((result.nextState as GameState).player.trace)).toBe(5)
  })

  it('should append a trace system line when traceChange is greater than 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, traceChange: 5 }),
    ))
    const result = await resolveCommand('frobnicate', state)
    const traceLine = result.lines.find(l => l.content.includes('+5 trace'))
    expect(traceLine).toBeDefined()
    expect(traceLine?.type).toBe('system')
  })

  it('should not append a trace line when traceChange is 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, traceChange: 0 }),
    ))
    const result = await resolveCommand('frobnicate', state)
    const traceLine = result.lines.find(l => l.content.includes('trace'))
    expect(traceLine).toBeUndefined()
  })

  it('should merge flagsSet into state.flags', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, flagsSet: { introComplete: true, metAria: false } }),
    ))
    const result = await resolveCommand('frobnicate', state)
    expect(result.nextState?.flags).toMatchObject({ introComplete: true, metAria: false })
  })

  it('should POST to /api/world with the correct payload shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkFetchResponse(DEFAULT_AI_RESPONSE))
    vi.stubGlobal('fetch', fetchMock)

    await resolveCommand('test command', state)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/world')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.command).toBe('test command')
    expect(body.currentNode.id).toBe('contractor_portal')
    expect(body.playerState.handle).toBe('ghost')
    expect(body.recentCommands).toBeInstanceOf(Array)
    expect(typeof body.turnCount).toBe('number')
  })
})

describe('resolveCommand — AI routing isUnknown', () => {
  let state: GameState

  beforeEach(() => {
    state = createInitialState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should render narrative as an error line when isUnknown is true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, isUnknown: true, narrative: 'Unknown command, ghostly.' }),
    ))
    const result = await resolveCommand('frobnicate', state)
    const narrativeLine = result.lines.find(l => l.content === 'Unknown command, ghostly.')
    expect(narrativeLine).toBeDefined()
    expect(narrativeLine?.type).toBe('error')
  })
})

describe('resolveCommand — AI routing accessGranted', () => {
  let state: GameState

  beforeEach(() => {
    state = createInitialState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should update the current node accessLevel when accessGranted is true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({
        ...DEFAULT_AI_RESPONSE,
        accessGranted: true,
        newAccessLevel: 'user',
      }),
    ))
    const result = await resolveCommand('frobnicate', state)
    const updatedNode = ((result.nextState as GameState).network.nodes)['contractor_portal']
    expect(updatedNode?.accessLevel).toBe('user')
  })

  it('should not update the node accessLevel when accessGranted is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({
        ...DEFAULT_AI_RESPONSE,
        accessGranted: false,
        newAccessLevel: 'user',
      }),
    ))
    const result = await resolveCommand('frobnicate', state)
    const updatedNode = ((result.nextState as GameState).network.nodes)['contractor_portal']
    expect(updatedNode?.accessLevel).toBe('none')
  })

  it('should not update the node accessLevel when newAccessLevel is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({
        ...DEFAULT_AI_RESPONSE,
        accessGranted: true,
        newAccessLevel: null,
      }),
    ))
    const result = await resolveCommand('frobnicate', state)
    const updatedNode = ((result.nextState as GameState).network.nodes)['contractor_portal']
    expect(updatedNode?.accessLevel).toBe('none')
  })
})

describe('resolveCommand — AI routing nodesUnlocked', () => {
  let state: GameState

  beforeEach(() => {
    state = createInitialState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should set discovered=true and locked=false for each node in nodesUnlocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, nodesUnlocked: ['vpn_gateway'] }),
    ))

    // vpn_gateway starts as undiscovered
    expect(state.network.nodes['vpn_gateway']?.discovered).toBe(false)

    const result = await resolveCommand('frobnicate', state)
    const vpn = ((result.nextState as GameState).network.nodes)['vpn_gateway']
    expect(vpn?.discovered).toBe(true)
    expect(vpn?.locked).toBe(false)
  })

  it('should leave other nodes unchanged when nodesUnlocked is populated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, nodesUnlocked: ['vpn_gateway'] }),
    ))
    const result = await resolveCommand('frobnicate', state)
    // contractor_portal was already discovered — should remain so
    expect(((result.nextState as GameState).network.nodes)['contractor_portal']?.discovered).toBe(true)
  })

  it('should silently ignore node IDs that do not exist in the network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, nodesUnlocked: ['does_not_exist'] }),
    ))
    // Should not throw
    await expect(resolveCommand('frobnicate', state)).resolves.toBeDefined()
  })

  it('should not mutate any nodes when nodesUnlocked is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, nodesUnlocked: [] }),
    ))
    const result = await resolveCommand('frobnicate', state)
    expect(((result.nextState as GameState).network.nodes)['vpn_gateway']?.discovered).toBe(false)
  })
})

describe('resolveCommand — AI routing fetch failure', () => {
  let state: GameState

  beforeEach(() => {
    state = createInitialState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should fall back to WORLD_AI_FALLBACK when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await resolveCommand('frobnicate', state)
    expect(result.lines[0].type).toBe('error')
    expect(result.lines[0].content).toMatch(/offline mode/)
  })

  it('should not apply any trace change on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await resolveCommand('frobnicate', state)
    expect(((result.nextState as GameState).player.trace)).toBe(0)
  })

  it('should still advance turn tracking on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await resolveCommand('frobnicate', state)
    expect(result.nextState?.turnCount).toBe(1)
    expect(result.nextState?.recentCommands).toContain('frobnicate')
  })

  it('should not append a trace line when falling back to WORLD_AI_FALLBACK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await resolveCommand('frobnicate', state)
    const traceLine = result.lines.find(l => l.content.includes('trace'))
    expect(traceLine).toBeUndefined()
  })
})
