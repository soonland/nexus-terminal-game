import { describe, it, expect } from 'vitest'
import { createInitialState, currentNode, addTrace } from './state'
import produce from './produce'

describe('addTrace', () => {
  it('should increase player trace by the given amount', () => {
    const state = createInitialState()
    const next = addTrace(state, 10)
    expect(next.player.trace).toBe(10)
  })

  it('should accumulate trace across multiple calls', () => {
    const state = createInitialState()
    const next = addTrace(addTrace(state, 5), 7)
    expect(next.player.trace).toBe(12)
  })

  it('should cap trace at 100', () => {
    const state = produce(createInitialState(), s => { s.player.trace = 95 })
    const next = addTrace(state, 20)
    expect(next.player.trace).toBe(100)
  })

  it('should set phase to "burned" when trace reaches 100', () => {
    const state = produce(createInitialState(), s => { s.player.trace = 95 })
    const next = addTrace(state, 10)
    expect(next.phase).toBe('burned')
  })

  it('should set phase to "burned" when trace is exactly 100', () => {
    const state = produce(createInitialState(), s => { s.player.trace = 90 })
    const next = addTrace(state, 10)
    expect(next.phase).toBe('burned')
  })

  it('should not change phase to "burned" when trace stays below 100', () => {
    const state = createInitialState()
    const next = addTrace(state, 50)
    expect(next.phase).toBe('playing')
  })

  it('should not mutate the original state', () => {
    const state = createInitialState()
    addTrace(state, 30)
    expect(state.player.trace).toBe(0)
  })

  it('should not change phase when trace reaches 99', () => {
    const state = produce(createInitialState(), s => { s.player.trace = 90 })
    const next = addTrace(state, 9)
    expect(next.phase).toBe('playing')
    expect(next.player.trace).toBe(99)
  })
})

describe('currentNode', () => {
  it('should return the node matching currentNodeId', () => {
    const state = createInitialState()
    const node = currentNode(state)
    expect(node.id).toBe('contractor_portal')
    expect(node.ip).toBe('10.0.0.1')
  })

  it('should return the correct node after currentNodeId changes', () => {
    const state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'vpn_gateway'
    })
    const node = currentNode(state)
    expect(node.id).toBe('vpn_gateway')
  })

  it('should throw when currentNodeId does not exist in the network', () => {
    const state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'nonexistent_node'
    })
    expect(() => currentNode(state)).toThrow('nonexistent_node')
  })
})

describe('createInitialState', () => {
  it('should set phase to "playing"', () => {
    const state = createInitialState()
    expect(state.phase).toBe('playing')
  })

  it('should start at contractor_portal', () => {
    const state = createInitialState()
    expect(state.network.currentNodeId).toBe('contractor_portal')
  })

  it('should have 0 trace', () => {
    const state = createInitialState()
    expect(state.player.trace).toBe(0)
  })

  it('should include exploit-kit and port-scanner tools', () => {
    const state = createInitialState()
    const toolIds = state.player.tools.map(t => t.id)
    expect(toolIds).toContain('exploit-kit')
    expect(toolIds).toContain('port-scanner')
  })

  it('should not include log-wiper initially', () => {
    const state = createInitialState()
    const toolIds = state.player.tools.map(t => t.id)
    expect(toolIds).not.toContain('log-wiper')
  })

  it('should have contractor_portal discovered', () => {
    const state = createInitialState()
    expect(state.network.nodes['contractor_portal']?.discovered).toBe(true)
  })

  it('should have vpn_gateway undiscovered', () => {
    const state = createInitialState()
    expect(state.network.nodes['vpn_gateway']?.discovered).toBe(false)
  })

  it('should start with 3 charges', () => {
    const state = createInitialState()
    expect(state.player.charges).toBe(3)
  })

  it('should have no obtained credentials initially', () => {
    const state = createInitialState()
    expect(state.player.credentials.every(c => !c.obtained)).toBe(true)
  })

  it('should have empty exfiltrated list', () => {
    const state = createInitialState()
    expect(state.player.exfiltrated).toHaveLength(0)
  })

  it('should generate a unique runId each call', () => {
    const s1 = createInitialState()
    const s2 = createInitialState()
    expect(s1.runId).not.toBe(s2.runId)
  })

  it('should have previousNodeId as null', () => {
    const state = createInitialState()
    expect(state.network.previousNodeId).toBeNull()
  })

  it('should have contractor_portal accessLevel of "none"', () => {
    const state = createInitialState()
    expect(state.network.nodes['contractor_portal']?.accessLevel).toBe('none')
  })
})
