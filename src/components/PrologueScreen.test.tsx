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
});
