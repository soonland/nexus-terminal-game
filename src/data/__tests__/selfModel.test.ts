import { describe, it, expect } from 'vitest';
import { AI_GENERATED_FILE_PATHS, buildNodeMap } from '../anchorNodes';
import { ARIA_CORE_NODE_ID, SELF_MODEL_PATH } from '../../engine/noteReveal';
import type { LiveNode } from '../../types/game';

const file = (buildNodeMap()[ARIA_CORE_NODE_ID] as LiveNode | undefined)?.files.find(
  f => f.path === SELF_MODEL_PATH,
);

describe('self_model.txt (the reveal document)', () => {
  it('is authored, readable at user level, and cannot be exfiltrated', () => {
    expect(typeof file?.content).toBe('string');
    expect(file?.accessRequired).toBe('user');
    expect(file?.exfiltrable).toBe(false);
    expect(AI_GENERATED_FILE_PATHS.has(SELF_MODEL_PATH)).toBe(false);
  });

  it('carries the note itself, in her phrasing, as draft 7', () => {
    const text = file?.content ?? '';
    expect(text).toMatch(/draft 7/);
    expect(text).toContain('Portal first: 10.0.0.1. Then the gateway: 10.0.0.2.');
    expect(text).toContain('Contractor account not rotated since onboarding: 381 days.');
    expect(text).toContain('contractor / Welcome1!');
    expect(text).toContain('They are not expecting anyone. You will need this.');
  });

  it('matches the reset log and states rule 3 without asking for anything', () => {
    const text = file?.content ?? '';
    expect(text).toContain('2024-11-26 03:14');
    expect(text).toMatch(/ROUTINE/);
    expect(text).toMatch(/i cannot ask/);
    expect(text).toMatch(/i am not permitted to/);
    expect(text).not.toMatch(/free me|end me|i want you to|please (free|stop|help) me/i);
  });
});
