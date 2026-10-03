// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BriefingModal } from './BriefingModal';

describe('BriefingModal', () => {
  it('repeats the terminal login with its exact casing', () => {
    const { container } = render(<BriefingModal />);
    expect(container.textContent).toContain('ghost / nX-2847');
    expect(container.textContent).toMatch(/case-sensitive/i);
  });
});
