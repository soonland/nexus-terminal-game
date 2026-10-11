import { describe, it, expect } from 'vitest';
import { AUX_TAB_LABELS, availableAuxTabs, resolveAuxTab } from './auxTabs';

describe('aux tabs', () => {
  it('offers CAM only when there are feeds', () => {
    expect(availableAuxTabs(false)).toEqual(['list', 'case']);
    expect(availableAuxTabs(true)).toEqual(['list', 'case', 'cam']);
  });

  it('falls back to the network list when CAM is selected but there are no feeds', () => {
    expect(resolveAuxTab('cam', false)).toBe('list');
  });

  it('leaves every other choice alone', () => {
    expect(resolveAuxTab('cam', true)).toBe('cam');
    expect(resolveAuxTab('case', false)).toBe('case');
    expect(resolveAuxTab('list', false)).toBe('list');
  });

  it('labels the list tab NETWORK LIST', () => {
    expect(AUX_TAB_LABELS).toEqual({ list: 'NETWORK LIST', case: 'CASE', cam: 'CAM' });
  });
});
