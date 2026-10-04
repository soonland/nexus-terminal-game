import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { OPERATIVE_PASS, PASSWORD_CASE_NOTE } from '../data/operativeLogin';
import { PRE_GAME_FONT_SIZE } from './preGameStyle';

interface Props {
  onContinue: () => void;
}

const LINES: Array<{ text: string; color: string; margin?: string }> = [
  {
    text: '  NEXUS CORP — OPERATIVE ACTIVATION NOTICE',
    color: 'var(--color-output)',
    margin: '0.15rem',
  },
  {
    text: '  ─────────────────────────────────────────────────────────────',
    color: 'var(--color-separator)',
    margin: '0.5rem',
  },
  { text: '  OPERATIVE : ghost', color: 'var(--color-system)', margin: '0.15rem' },
  { text: '  TICKET    : NX-2847', color: 'var(--color-system)', margin: '0.15rem' },
  { text: '  CLEARED   : [REDACTED]', color: 'var(--color-system)', margin: '0.6rem' },
  {
    text: '  You were recruited eighteen months ago. Two weeks of off-site',
    color: 'var(--color-output)',
    margin: '0.15rem',
  },
  {
    text: '  conditioning. A new name. They gave you a terminal handle and',
    color: 'var(--color-output)',
    margin: '0.15rem',
  },
  {
    text: '  told you the password was the ticket number. Cute.',
    color: 'var(--color-output)',
    margin: '0.15rem',
  },
  {
    text: `  Type it exactly: ${OPERATIVE_PASS} (${PASSWORD_CASE_NOTE}).`,
    color: 'var(--color-system)',
    margin: '0.6rem',
  },
  {
    text: '  The brief came through last night. Three lines on an encrypted',
    color: 'var(--color-output)',
    margin: '0.15rem',
  },
  {
    text: '  channel that auto-wiped at 0400. Target: IronGate Corp. Entry',
    color: 'var(--color-output)',
    margin: '0.15rem',
  },
  {
    text: '  vector: their contractor portal. One attachment.',
    color: 'var(--color-output)',
    margin: '0.6rem',
  },
  {
    text: '  ── NOTE_01.TXT ─────────────────────────────────────────────',
    color: 'var(--color-separator)',
    margin: '0.15rem',
  },
  {
    text: '  SOURCE : UNKNOWN — RECEIVED VIA ANONYMOUS DROP',
    color: 'var(--color-system)',
    margin: '0.15rem',
  },
  { text: '  STATUS : UNVERIFIED', color: 'var(--color-system)', margin: '0.5rem' },
  {
    text: '    Portal first: 10.0.0.1. Then the gateway: 10.0.0.2.',
    color: 'var(--color-system)',
    margin: '0.15rem',
  },
  {
    text: '    Contractor account not rotated since onboarding: 381 days.',
    color: 'var(--color-system)',
    margin: '0.15rem',
  },
  { text: '    contractor / Welcome1!', color: 'var(--color-output)', margin: '0.15rem' },
  {
    text: '    They are not expecting anyone. You will need this.',
    color: 'var(--color-system)',
    margin: '0.5rem',
  },
  {
    text: '  ORIGIN UNCONFIRMED. DO NOT ASSUME FRIENDLY SOURCE.',
    color: 'var(--color-error)',
    margin: '0.15rem',
  },
  {
    text: '  ─────────────────────────────────────────────────────────────',
    color: 'var(--color-separator)',
    margin: '0.6rem',
  },
  {
    text: "  You don't know who sent it. You don't ask.",
    color: 'var(--color-output)',
    margin: '0.6rem',
  },
  {
    text: '  DISPATCH said: find what is in the executive subnet. You will',
    color: 'var(--color-output)',
    margin: '0.15rem',
  },
  {
    text: '  know it when you see it. There is no extraction plan.',
    color: 'var(--color-output)',
    margin: '0.6rem',
  },
  { text: '  There never is.', color: 'var(--color-error)', margin: '0.6rem' },
  {
    text: '  ─────────────────────────────────────────────────────────────',
    color: 'var(--color-separator)',
    margin: '0.35rem',
  },
  {
    text: '  OPERATIONAL NOTES',
    color: 'var(--color-output)',
    margin: '0.15rem',
  },
  {
    text: '  Every action inside their network raises your TRACE level.',
    color: 'var(--color-system)',
    margin: '0.15rem',
  },
  {
    text: '  Hit 100% and the session burns — you lose your foothold.',
    color: 'var(--color-system)',
    margin: '0.15rem',
  },
  {
    text: '  Exfiltrated files and found credentials survive a burn.',
    color: 'var(--color-system)',
    margin: '0.6rem',
  },
  {
    text: '  ─────────────────────────────────────────────────────────────',
    color: 'var(--color-separator)',
    margin: '0.35rem',
  },
];

const PROMPT_LINE = {
  text: '  Press Enter to access your field terminal.',
  color: 'var(--color-system)',
  margin: '0.35rem',
};

export const PrologueScreen = ({ onContinue }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // True while part of the text is still hidden below the fold, so the player knows to scroll.
  const [moreBelow, setMoreBelow] = useState(false);

  const updateMoreBelow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);

  useLayoutEffect(() => {
    updateMoreBelow();
    window.addEventListener('resize', updateMoreBelow);
    return () => {
      window.removeEventListener('resize', updateMoreBelow);
    };
  }, [updateMoreBelow]);

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
      className="desktop"
      onClick={() => inputRef.current?.focus()}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
        fontSize: PRE_GAME_FONT_SIZE,
        lineHeight: 'var(--line-height)',
        cursor: 'text',
        overflow: 'hidden',
      }}>
      {/* Scrollable content */}
      <div
        ref={scrollRef}
        data-testid="prologue-scroll"
        onScroll={updateMoreBelow}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center',
          padding: '1.25rem 2rem 0.5rem',
        }}>
        <div style={{ width: '100%', maxWidth: '68ch', whiteSpace: 'pre' }}>
          {LINES.map((line, i) => (
            <div key={i} style={{ color: line.color, marginBottom: line.margin ?? '0' }}>
              {line.text}
            </div>
          ))}
        </div>
      </div>

      {/* Pinned input area */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 2rem 1rem' }}>
        <div style={{ width: '100%', maxWidth: '68ch', whiteSpace: 'pre' }}>
          {moreBelow && (
            <div
              data-testid="prologue-more"
              style={{ color: 'var(--color-dim)', textAlign: 'right', marginBottom: '0.25rem' }}>
              {'▼ more below (scroll)'}
            </div>
          )}
          <div style={{ color: PROMPT_LINE.color, marginBottom: PROMPT_LINE.margin }}>
            {PROMPT_LINE.text}
          </div>
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
                fontSize: PRE_GAME_FONT_SIZE,
                lineHeight: 'var(--line-height)',
                caretColor: 'var(--color-output)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
