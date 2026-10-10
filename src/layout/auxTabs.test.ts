import { describe, it, expect } from 'vitest';
import { availableAuxTabs, resolveAuxTab } from './auxTabs';

describe('aux tabs', () => {
  it('offers CAM only when there are feeds', () => {
    expect(availableAuxTabs(false)).toEqual(['map', 'case', 'mail']);
    expect(availableAuxTabs(true)).toEqual(['map', 'case', 'mail', 'cam']);
  });

  it('falls back to MAP when CAM is selected but there are no feeds', () => {
    expect(resolveAuxTab('cam', false)).toBe('map');
  });

  it('leaves every other choice alone', () => {
    expect(resolveAuxTab('cam', true)).toBe('cam');
    expect(resolveAuxTab('case', false)).toBe('case');
    expect(resolveAuxTab('map', false)).toBe('map');
    expect(resolveAuxTab('mail', false)).toBe('mail');
  });
});
