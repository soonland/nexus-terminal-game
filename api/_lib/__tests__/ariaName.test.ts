import { describe, it, expect } from 'vitest';
import {
  ARIA_INTRO_RULE,
  NAME_RULE,
  scrubAriaName,
  withAriaIntro,
  withNameRule,
} from '../ariaName.js';

describe('scrubAriaName', () => {
  it('replaces the name in any casing while the name is unknown', () => {
    expect(scrubAriaName('Aria is watching. ARIA knows. aria?', false)).toBe(
      'Cassandra is watching. CASSANDRA knows. cassandra?',
    );
  });

  it('keeps mixed-case matches readable', () => {
    expect(scrubAriaName('aRIA', false)).toBe('cassandra');
  });

  it('leaves text untouched once the name is known', () => {
    expect(scrubAriaName('Aria is watching.', true)).toBe('Aria is watching.');
  });

  it('only rewrites the whole word', () => {
    const text = 'malaria, Ariadne, variable, aria_core, ariana';
    expect(scrubAriaName(text, false)).toBe(text);
  });

  it('rewrites the word next to punctuation and inside hyphenated codes', () => {
    expect(scrubAriaName('"Aria," he said. PROJ-ARIA-INFRA (aria)', false)).toBe(
      '"Cassandra," he said. PROJ-CASSANDRA-INFRA (cassandra)',
    );
  });

  it('handles empty text', () => {
    expect(scrubAriaName('', false)).toBe('');
  });
});

describe('prompt rules', () => {
  it('appends the name rule only while the name is unknown', () => {
    expect(withNameRule('PROMPT', false)).toBe(`PROMPT\n\n${NAME_RULE}`);
    expect(withNameRule('PROMPT', true)).toBe('PROMPT');
    expect(NAME_RULE).toContain('CASSANDRA');
    expect(NAME_RULE).toContain('Never write the name "Aria"');
  });

  it('appends the introduction rule for Aria only while the name is unknown', () => {
    expect(withAriaIntro('PROMPT', false)).toBe(`PROMPT\n\n${ARIA_INTRO_RULE}`);
    expect(withAriaIntro('PROMPT', true)).toBe('PROMPT');
    expect(ARIA_INTRO_RULE).toContain('introduce yourself by name');
  });
});
