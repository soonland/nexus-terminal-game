// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';
import { TerminalInput } from './TerminalInput';

describe('TerminalInput', () => {
  it('renders a text input with autofill disabled when not masked', () => {
    render(<TerminalInput onSubmit={vi.fn()} masked={false} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveProperty('type', 'text');
    expect(input.getAttribute('autocomplete')).toBe('off');
  });

  it('switches to a password input with a browser-respected autocomplete value when masked', () => {
    render(<TerminalInput onSubmit={vi.fn()} masked />);
    const input = screen.getByTestId('terminal-command-input');
    expect(input).toHaveProperty('type', 'password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
  });

  it('remounts the input element (not just toggling its type) when masked changes', () => {
    const { rerender } = render(<TerminalInput onSubmit={vi.fn()} masked={false} />);
    const before = screen.getByTestId('terminal-command-input');
    rerender(<TerminalInput onSubmit={vi.fn()} masked />);
    const after = screen.getByTestId('terminal-command-input');
    expect(after).not.toBe(before);
  });

  it('refocuses the new input after a masked-driven remount', () => {
    const ref = createRef<HTMLInputElement>();
    const { rerender } = render(<TerminalInput ref={ref} onSubmit={vi.fn()} masked={false} />);
    act(() => {
      ref.current?.blur();
    });
    rerender(<TerminalInput ref={ref} onSubmit={vi.fn()} masked />);
    expect(document.activeElement).toBe(ref.current);
  });
});
