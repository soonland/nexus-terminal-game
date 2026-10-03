// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HelpModal } from './HelpModal';

describe('HelpModal', () => {
  it('does not mention Aria before the name is known', () => {
    const { container } = render(<HelpModal ariaNameKnown={false} />);
    expect(container.textContent).not.toMatch(/aria/i);
    expect(container.textContent).toMatch(/msg sentinel/);
  });

  it('lists msg aria and the aria memory once the name is known', () => {
    const { container } = render(<HelpModal ariaNameKnown />);
    expect(container.textContent).toMatch(/msg aria <message>/);
    expect(container.textContent).toMatch(/aria memory/i);
  });
});
