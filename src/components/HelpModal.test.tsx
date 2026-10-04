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

  it('describes view-cam by camera name, and its trace cost by floor, not by an old camera number', () => {
    const { container } = render(<HelpModal ariaNameKnown={false} />);
    expect(container.textContent).toMatch(/view-cam <camera>/);
    expect(container.textContent).toMatch(/executive: \+1 trace/);
    expect(container.textContent).not.toMatch(/cam_03/);
  });
});
