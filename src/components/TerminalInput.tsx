import type { KeyboardEvent } from 'react';
import { forwardRef, useEffect, useRef } from 'react';
import { useCommandHistory } from '../hooks/useCommandHistory';

interface Props {
  onSubmit: (command: string) => void;
  disabled?: boolean;
  suggestions?: string[];
  prompt?: string;
  masked?: boolean;
  noHistory?: boolean;
  focusPolicy?: 'always' | 'if-idle';
  testId?: string;
}

export const TerminalInput = forwardRef<HTMLInputElement, Props>(
  (
    {
      onSubmit,
      disabled = false,
      suggestions = [],
      prompt = 'nexus $',
      masked = false,
      noHistory = false,
      focusPolicy = 'always',
      testId = 'terminal-command-input',
    },
    ref,
  ) => {
    const { push, navigate } = useCommandHistory();
    const tabIndex = useRef(-1);

    useEffect(() => {
      if (disabled || !ref || !('current' in ref)) return;
      const input = ref.current;
      if (!input) return;
      if (focusPolicy === 'if-idle') {
        // Another pane (e.g. the COMMS input) may hold focus: only take it when nothing does.
        const active = document.activeElement;
        const idle = !active || active === document.body || active === input;
        if (!idle) return;
      }
      input.focus();
      // `masked` is a dependency because the <input> below is remounted (via
      // `key`) whenever it changes — the new element starts unfocused.
    }, [disabled, ref, masked, focusPolicy]);

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      const input = e.currentTarget;

      if (e.key === 'Enter') {
        const value = input.value;
        if (!noHistory && !masked && value) push(value);
        onSubmit(value);
        input.value = '';
        e.preventDefault();
        return;
      }

      if (masked) return; // no history navigation for password fields

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        input.value = navigate('up');
        setTimeout(() => {
          input.setSelectionRange(input.value.length, input.value.length);
        }, 0);
        return;
      }

      if (e.key.startsWith('F') && /^F\d+$/.test(e.key)) {
        const idx = Number.parseInt(e.key.slice(1), 10) - 1;
        if (idx >= 0 && idx < suggestions.length) {
          e.preventDefault();
          input.value = suggestions[idx] ?? '';
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (suggestions.length === 0) return;
        tabIndex.current = (tabIndex.current + 1) % suggestions.length;
        input.value = suggestions[tabIndex.current] ?? '';
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        input.value = navigate('down');
        setTimeout(() => {
          input.setSelectionRange(input.value.length, input.value.length);
        }, 0);
        return;
      }
    };

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 1.5rem',
          borderTop: '1px solid var(--color-border)',
          gap: '0.75rem',
        }}>
        <span
          style={{
            color: 'var(--color-system)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-secondary)',
            flexShrink: 0,
            userSelect: 'none',
          }}>
          {prompt}
        </span>

        <input
          // Force a real remount when switching to/from a password field —
          // some browsers keep offering autofill/save-password suggestions on
          // an element that was ever type="password", even after it flips
          // back to type="text" for the regular command prompt.
          key={masked ? 'masked' : 'unmasked'}
          ref={ref}
          data-testid={testId}
          type={masked ? 'password' : 'text'}
          autoComplete={masked ? 'new-password' : 'off'}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-output)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-secondary)',
            lineHeight: 'var(--line-height)',
            caretColor: 'var(--color-output)',
          }}
        />
      </div>
    );
  },
);
