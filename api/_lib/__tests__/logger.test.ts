import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeLogger } from '../logger.js';

describe('makeLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.clearAllMocks();
  });

  it('prefixes error messages with the tag', () => {
    const log = makeLogger('world');
    log.error('something broke');
    expect(console.error).toHaveBeenCalledWith('[world]', 'something broke');
  });

  it('prefixes warn messages with the tag', () => {
    const log = makeLogger('aria');
    log.warn('heads up');
    expect(console.warn).toHaveBeenCalledWith('[aria]', 'heads up');
  });

  it('forwards extra arguments', () => {
    const log = makeLogger('file');
    log.error('HTTP error', 503, 'bad gateway');
    expect(console.error).toHaveBeenCalledWith('[file]', 'HTTP error', 503, 'bad gateway');
  });

  it('uses the correct tag per logger instance', () => {
    const a = makeLogger('foo');
    const b = makeLogger('bar');
    a.error('msg');
    b.error('msg');
    expect(console.error).toHaveBeenNthCalledWith(1, '[foo]', 'msg');
    expect(console.error).toHaveBeenNthCalledWith(2, '[bar]', 'msg');
  });
});
