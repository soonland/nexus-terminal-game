// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PrologueScreen } from './PrologueScreen';

describe('PrologueScreen', () => {
  it('states the exact password and its casing, not just "the ticket number"', () => {
    const { container } = render(<PrologueScreen onContinue={() => undefined} />);
    expect(container.textContent).toContain('nX-2847');
    expect(container.textContent).toContain('lowercase n, capital X');
  });

  it('gives the note her fingerprint: counts, events in order, no clock — and still the credentials', () => {
    const { container } = render(<PrologueScreen onContinue={() => undefined} />);
    const text = container.textContent;
    expect(text).toContain('Portal first: 10.0.0.1. Then the gateway: 10.0.0.2.');
    expect(text).toContain('not rotated since onboarding: 381 days');
    expect(text).toContain('contractor / Welcome1!');
    expect(text).toContain('They are not expecting anyone. You will need this.');
    expect(text).toContain('ORIGIN UNCONFIRMED. DO NOT ASSUME FRIENDLY SOURCE.');
  });
});
