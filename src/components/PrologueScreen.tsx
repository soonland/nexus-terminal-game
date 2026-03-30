import type { KeyboardEvent } from 'react';
import { useEffect, useRef } from 'react';

interface Props {
  onContinue: () => void;
}

const LINES: Array<{ text: string; color: string; margin?: string }> = [
  {
    text: '  NEXUS CORP — OPERATIVE ACTIVATION NOTICE',
    color: 'var(--color-output)',
    margin: '0.25rem',
  },
  {
    text: '  ─────────────────────────────────────────────────────────────',
    color: 'var(--color-separator)',
    margin: '0.75rem',
  },
  { text: '  OPERATIVE : ghost', color: 'var(--color-system)', margin: '0.25rem' },
  { text: '  TICKET    : NX-2847', color: 'var(--color-system)', margin: '0.25rem' },
  { text: '  CLEARED   : [REDACTED]', color: 'var(--color-system)', margin: '1rem' },
  {
    text: '  You were recruited eighteen months ago. Two weeks of off-site',
    color: 'var(--color-output)',
    margin: '0.25rem',
  },
  {
    text: '  conditioning. A new name. They gave you a terminal handle and',
    color: 'var(--color-output)',
    margin: '0.25rem',
  },
  {
    text: '  told you the password was the ticket number. Cute.',
    color: 'var(--color-output)',
    margin: '1rem',
  },
  {
    text: '  The brief came through last night. Three lines on an encrypted',
    color: 'var(--color-output)',
    margin: '0.25rem',
  },
  {
    text: '  channel that auto-wiped at 0400. Target: IronGate Corp. Entry',
    color: 'var(--color-output)',
    margin: '0.25rem',
  },
  {
    text: '  vector: their contractor portal. One attachment.',
    color: 'var(--color-output)',
    margin: '1rem',
  },
  {
    text: '  ── NOTE_01.TXT ─────────────────────────────────────────────',
    color: 'var(--color-separator)',
    margin: '0.25rem',
  },
  {
    text: '  SOURCE : UNKNOWN — RECEIVED VIA ANONYMOUS DROP',
    color: 'var(--color-system)',
    margin: '0.25rem',
  },
  { text: '  STATUS : UNVERIFIED', color: 'var(--color-system)', margin: '0.75rem' },
  {
    text: '    IronGate contractor credentials have not been rotated.',
    color: 'var(--color-system)',
    margin: '0.25rem',
  },
  { text: '    contractor / Welcome1!', color: 'var(--color-output)', margin: '0.25rem' },
  {
    text: '    Portal: 10.0.0.1. They are not expecting anyone.',
    color: 'var(--color-system)',
    margin: '0.75rem',
  },
  { text: '    You will need this.', color: 'var(--color-system)', margin: '0.75rem' },
  {
    text: '  ORIGIN UNCONFIRMED. DO NOT ASSUME FRIENDLY SOURCE.',
    color: 'var(--color-error)',
    margin: '0.25rem',
  },
  {
    text: '  ─────────────────────────────────────────────────────────────',
    color: 'var(--color-separator)',
    margin: '1rem',
  },
  {
    text: "  You don't know who sent it. You don't ask.",
    color: 'var(--color-output)',
    margin: '1rem',
  },
  {
    text: '  DISPATCH said: find what is in the executive subnet. You will',
    color: 'var(--color-output)',
    margin: '0.25rem',
  },
  {
    text: '  know it when you see it. There is no extraction plan.',
    color: 'var(--color-output)',
    margin: '1rem',
  },
  { text: '  There never is.', color: 'var(--color-error)', margin: '1rem' },
  {
    text: '  ─────────────────────────────────────────────────────────────',
    color: 'var(--color-separator)',
    margin: '0.5rem',
  },
  {
    text: '  Press Enter to access your field terminal.',
    color: 'var(--color-system)',
    margin: '0.5rem',
  },
];

export const PrologueScreen = ({ onContinue }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onContinue();
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size)',
        lineHeight: 'var(--line-height)',
        cursor: 'text',
        padding: '2rem',
      }}>
      <div style={{ width: '100%', maxWidth: '68ch', whiteSpace: 'pre' }}>
        {LINES.map((line, i) => (
          <div key={i} style={{ color: line.color, marginBottom: line.margin ?? '0' }}>
            {line.text}
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            borderTop: '1px solid var(--color-border)',
            paddingTop: '0.5rem',
          }}>
          <span style={{ color: 'var(--color-system)', userSelect: 'none' }}>{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--color-output)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size)',
              lineHeight: 'var(--line-height)',
              caretColor: 'var(--color-output)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
