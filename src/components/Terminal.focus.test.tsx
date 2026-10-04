// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Terminal } from './Terminal';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const TerminalUnderTest = ({ show }: { show: boolean }) => (
  <>
    <button type="button">other</button>
    {show && <Terminal lines={[]} nodeIp="10.0.0.1" suggestions={[]} onSubmit={vi.fn()} />}
  </>
);

describe('Terminal focus', () => {
  it('does not steal focus from another element when it mounts', () => {
    const { rerender } = render(<TerminalUnderTest show={false} />);
    screen.getByRole('button', { name: 'other' }).focus();
    rerender(<TerminalUnderTest show />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'other' }));
  });

  it('focuses its input when nothing else holds focus', () => {
    render(<TerminalUnderTest show />);
    expect(document.activeElement).toBe(screen.getByTestId('terminal-command-input'));
  });
});
