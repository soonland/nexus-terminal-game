import { describe, it, expect } from 'vitest'
import { makeLine, getTraceLevel } from './terminal'
import type { LineType } from './terminal'

describe('makeLine', () => {
  it('should return a TerminalLine with the given type', () => {
    const line = makeLine('output', 'hello world')
    expect(line.type).toBe('output')
  })

  it('should return a TerminalLine with the given content', () => {
    const line = makeLine('error', 'something went wrong')
    expect(line.content).toBe('something went wrong')
  })

  it('should assign a non-empty string id', () => {
    const line = makeLine('system', 'msg')
    expect(typeof line.id).toBe('string')
    expect(line.id.length).toBeGreaterThan(0)
  })

  it('should assign a numeric timestamp', () => {
    const before = Date.now()
    const line = makeLine('system', 'msg')
    const after = Date.now()
    expect(typeof line.timestamp).toBe('number')
    expect(line.timestamp).toBeGreaterThanOrEqual(before)
    expect(line.timestamp).toBeLessThanOrEqual(after)
  })

  it('should produce unique ids for successive calls', () => {
    const a = makeLine('output', 'first')
    const b = makeLine('output', 'second')
    expect(a.id).not.toBe(b.id)
  })

  it.each<LineType>(['output', 'input', 'system', 'error', 'separator', 'aria'])(
    'should accept LineType "%s"',
    (type) => {
      const line = makeLine(type, 'test')
      expect(line.type).toBe(type)
    },
  )

  it('should allow empty string content', () => {
    const line = makeLine('separator', '')
    expect(line.content).toBe('')
  })
})

describe('getTraceLevel', () => {
  it('should return "safe" label at 0', () => {
    const level = getTraceLevel(0)
    expect(level.label).toBe('safe')
    expect(level.value).toBe(0)
  })

  it('should return "safe" label at 30', () => {
    expect(getTraceLevel(30).label).toBe('safe')
  })

  it('should return "elevated" label at 31', () => {
    expect(getTraceLevel(31).label).toBe('elevated')
  })

  it('should return "elevated" label at 60', () => {
    expect(getTraceLevel(60).label).toBe('elevated')
  })

  it('should return "active" label at 61', () => {
    expect(getTraceLevel(61).label).toBe('active')
  })

  it('should return "active" label at 85', () => {
    expect(getTraceLevel(85).label).toBe('active')
  })

  it('should return "aggressive" label at 86', () => {
    expect(getTraceLevel(86).label).toBe('aggressive')
  })

  it('should return "aggressive" label at 99', () => {
    expect(getTraceLevel(99).label).toBe('aggressive')
  })

  it('should return "burned" label at 100', () => {
    expect(getTraceLevel(100).label).toBe('burned')
  })

  it('should include the correct color variable for "safe"', () => {
    expect(getTraceLevel(0).color).toBe('var(--color-safe)')
  })

  it('should include the correct color variable for "elevated"', () => {
    expect(getTraceLevel(50).color).toBe('var(--color-elevated)')
  })

  it('should include the correct color variable for "active"', () => {
    expect(getTraceLevel(70).color).toBe('var(--color-active)')
  })

  it('should include the correct color variable for "aggressive"', () => {
    expect(getTraceLevel(90).color).toBe('var(--color-aggressive)')
  })

  it('should include the error color variable for "burned"', () => {
    expect(getTraceLevel(100).color).toBe('var(--color-error)')
  })

  it('should echo back the exact value passed in', () => {
    expect(getTraceLevel(42).value).toBe(42)
    expect(getTraceLevel(77).value).toBe(77)
  })
})
