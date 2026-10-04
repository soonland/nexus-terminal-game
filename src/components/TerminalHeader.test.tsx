// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TerminalHeader } from './TerminalHeader';

describe('TerminalHeader', () => {
  it('shows the title and the node ip, and no trace readout (that is the COMMS meter now)', () => {
    const { container } = render(<TerminalHeader nodeIp="10.1.0.2" />);
    expect(container.textContent).toContain('NEXUS OPS');
    expect(container.textContent).toContain('10.1.0.2');
    expect(container.textContent).not.toMatch(/TRC|%/);
  });
});
