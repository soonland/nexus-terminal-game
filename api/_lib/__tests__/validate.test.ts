import { describe, it, expect } from 'vitest'
import { ValidationError, requireString, requireObject } from '../validate.js'

describe('ValidationError', () => {
  it('should have name ValidationError', () => {
    const err = new ValidationError('test')
    expect(err.name).toBe('ValidationError')
    expect(err.message).toBe('test')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('requireString', () => {
  it('should return trimmed value when given a valid non-empty string', () => {
    expect(requireString('  hello  ', 'field')).toBe('hello')
  })

  it('should return the value as-is when it needs no trimming', () => {
    expect(requireString('world', 'field')).toBe('world')
  })

  it('should throw ValidationError when given an empty string', () => {
    expect(() => requireString('', 'prompt')).toThrowError(ValidationError)
    expect(() => requireString('', 'prompt')).toThrow('Missing or empty field: prompt')
  })

  it('should throw ValidationError when given a whitespace-only string', () => {
    expect(() => requireString('   ', 'field')).toThrowError(ValidationError)
    expect(() => requireString('   ', 'field')).toThrow('Missing or empty field: field')
  })

  it('should throw ValidationError when given a number', () => {
    expect(() => requireString(42 as unknown as string, 'nodeId')).toThrowError(ValidationError)
    expect(() => requireString(42 as unknown as string, 'nodeId')).toThrow('Missing or empty field: nodeId')
  })

  it('should throw ValidationError when given null', () => {
    expect(() => requireString(null as unknown as string, 'field')).toThrowError(ValidationError)
  })

  it('should throw ValidationError when given undefined', () => {
    expect(() => requireString(undefined as unknown as string, 'field')).toThrowError(ValidationError)
  })

  it('should throw ValidationError when given an object', () => {
    expect(() => requireString({} as unknown as string, 'field')).toThrowError(ValidationError)
  })

  it('should include the field name in the error message', () => {
    expect(() => requireString('', 'mySpecialField')).toThrow('Missing or empty field: mySpecialField')
  })
})

describe('requireObject', () => {
  it('should return the object when given a valid plain object', () => {
    const obj = { a: 1, b: 'two' }
    expect(requireObject(obj, 'body')).toBe(obj)
  })

  it('should return an empty object', () => {
    const obj = {}
    expect(requireObject(obj, 'body')).toBe(obj)
  })

  it('should throw ValidationError when given null', () => {
    expect(() => requireObject(null, 'Request body')).toThrowError(ValidationError)
    expect(() => requireObject(null, 'Request body')).toThrow('Request body must be a JSON object')
  })

  it('should throw ValidationError when given an array', () => {
    expect(() => requireObject([], 'Request body')).toThrowError(ValidationError)
    expect(() => requireObject([], 'Request body')).toThrow('Request body must be a JSON object')
  })

  it('should throw ValidationError when given a non-empty array', () => {
    expect(() => requireObject([1, 2], 'body')).toThrowError(ValidationError)
  })

  it('should throw ValidationError when given a string', () => {
    expect(() => requireObject('hello', 'Request body')).toThrowError(ValidationError)
    expect(() => requireObject('hello', 'Request body')).toThrow('Request body must be a JSON object')
  })

  it('should throw ValidationError when given a number', () => {
    expect(() => requireObject(42, 'body')).toThrowError(ValidationError)
  })

  it('should throw ValidationError when given undefined', () => {
    expect(() => requireObject(undefined, 'body')).toThrowError(ValidationError)
  })

  it('should include the label in the error message', () => {
    expect(() => requireObject(null, 'Payload')).toThrow('Payload must be a JSON object')
  })
})
