// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import type { RefObject } from 'react';
import { render, screen } from '@testing-library/react';
import { TerminalInput } from './TerminalInput';

interface WrapperProps {
  show: boolean;
  policy: 'always' | 'if-idle';
  disabled?: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}

const Wrapper = ({ show, policy, disabled = false, inputRef }: WrapperProps) => (
  <>
    <button type="button">other</button>
    {show && (
      <TerminalInput ref={inputRef} onSubmit={vi.fn()} focusPolicy={policy} disabled={disabled} />
    )}
  </>
);

const other = () => screen.getByRole('button', { name: 'other' });

describe('TerminalInput focusPolicy', () => {
  it('"always" takes focus even when something else holds it', () => {
    const ref = createRef<HTMLInputElement>();
    const { rerender } = render(<Wrapper show={false} policy="always" inputRef={ref} />);
    other().focus();
    rerender(<Wrapper show policy="always" inputRef={ref} />);
    expect(document.activeElement).toBe(ref.current);
  });

  it('"if-idle" does not steal focus from another element', () => {
    const ref = createRef<HTMLInputElement>();
    const { rerender } = render(<Wrapper show={false} policy="if-idle" inputRef={ref} />);
    other().focus();
    rerender(<Wrapper show policy="if-idle" inputRef={ref} />);
    expect(document.activeElement).toBe(other());
  });

  it('"if-idle" focuses the input when nothing else holds focus', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Wrapper show policy="if-idle" inputRef={ref} />);
    expect(document.activeElement).toBe(ref.current);
  });

  it('"if-idle" does not steal focus back when the input is re-enabled', () => {
    const ref = createRef<HTMLInputElement>();
    const { rerender } = render(<Wrapper show policy="if-idle" inputRef={ref} />);
    other().focus();
    rerender(<Wrapper show policy="if-idle" disabled inputRef={ref} />);
    rerender(<Wrapper show policy="if-idle" inputRef={ref} />);
    expect(document.activeElement).toBe(other());
  });

  it('"if-idle" does refocus after being re-enabled when nothing else holds focus', () => {
    const ref = createRef<HTMLInputElement>();
    const { rerender } = render(<Wrapper show policy="if-idle" inputRef={ref} />);
    rerender(<Wrapper show policy="if-idle" disabled inputRef={ref} />);
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(<Wrapper show policy="if-idle" inputRef={ref} />);
    expect(document.activeElement).toBe(ref.current);
  });

  it('accepts a custom test id', () => {
    render(<TerminalInput onSubmit={vi.fn()} testId="comms-input" />);
    expect(screen.getByTestId('comms-input')).toBeTruthy();
    expect(screen.queryByTestId('terminal-command-input')).toBeNull();
  });
});
