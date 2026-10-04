import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { PRE_GAME_FONT_SIZE } from './preGameStyle';

interface Props {
  onAgree: () => void;
}

const divider = {
  borderBottom: '1px solid var(--color-separator)',
  marginBottom: '0.5rem',
};

export const WelcomeScreen = ({ onAgree }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);
  const [guideFocused, setGuideFocused] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = e.currentTarget.value.trim();
    if (value.toUpperCase() === 'AGREE') {
      onAgree();
    } else {
      setError(true);
      e.currentTarget.value = '';
    }
  };

  return (
    <div
      className="desktop"
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
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center',
          padding: '2rem 2rem 1rem',
        }}>
        <div style={{ width: '100%', maxWidth: '68ch' }}>
          {/* Title */}
          <div
            style={{
              color: 'var(--color-output)',
              fontSize: '1.3em',
              fontWeight: 600,
              letterSpacing: '0.15em',
              borderBottom: '2px solid var(--color-border)',
              paddingBottom: '0.75rem',
              marginBottom: '1.5rem',
            }}>
            NEXUS // TERMINAL
          </div>

          {/* Mission brief */}
          <div style={{ color: 'var(--color-output)', marginBottom: '0.5rem' }}>
            WELCOME, OPERATIVE.
          </div>
          <div style={{ color: 'var(--color-system)', marginBottom: '0.25rem' }}>
            You are a Nexus Corp field operative. Your handler has assigned
          </div>
          <div style={{ color: 'var(--color-system)', marginBottom: '0.25rem' }}>
            you to infiltrate IronGate Corp — pivot node by node toward the
          </div>
          <div style={{ color: 'var(--color-system)', marginBottom: '1rem' }}>
            executive subnet. Your objective is classified.
          </div>

          {/* How to play */}
          <div style={{ color: 'var(--color-output)', marginBottom: '0.25rem' }}>HOW TO PLAY</div>
          <div style={divider} />
          <div style={{ color: 'var(--color-system)', marginBottom: '0.25rem' }}>
            · Use terminal commands to navigate nodes and extract data
          </div>
          <div style={{ color: 'var(--color-system)', marginBottom: '0.25rem' }}>
            · Each action raises your TRACE level — hit 100% and you burn
          </div>
          <div style={{ color: 'var(--color-system)', marginBottom: '1rem' }}>
            · Type <span style={{ whiteSpace: 'pre' }}> help </span> at any time for a full command
            reference
          </div>

          {/* Disclaimer */}
          <div style={{ color: 'var(--color-output)', marginBottom: '0.25rem' }}>DISCLAIMER</div>
          <div style={divider} />
          <div style={{ color: 'var(--color-error)', marginBottom: '0.25rem' }}>
            This is a FICTIONAL game for entertainment purposes only.
          </div>
          <div style={{ color: 'var(--color-system)', marginBottom: '0.25rem' }}>
            All systems, corporations, persons, and events depicted are
          </div>
          <div style={{ color: 'var(--color-system)', marginBottom: '0.25rem' }}>
            entirely fictitious. This game does not teach, promote, or
          </div>
          <div style={{ color: 'var(--color-system)', marginBottom: '0.25rem' }}>
            encourage unauthorized computer access of any kind.
          </div>
          <div style={{ color: 'var(--color-system)', marginBottom: '1rem' }}>
            Any resemblance to real systems or organizations is coincidental.
          </div>
        </div>
      </div>

      {/* Pinned input area */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 2rem 1.5rem' }}>
        <div style={{ width: '100%', maxWidth: '68ch' }}>
          <div style={divider} />
          {error && (
            <div style={{ color: 'var(--color-error)', marginBottom: '0.25rem' }}>
              Type <span style={{ whiteSpace: 'pre' }}> AGREE </span> to acknowledge the disclaimer
              and continue.
            </div>
          )}
          <div style={{ color: 'var(--color-output)', marginBottom: '0.5rem' }}>
            Type <span style={{ whiteSpace: 'pre' }}> AGREE </span> and press Enter to acknowledge
            and begin.
          </div>

          {/* Guide link */}
          <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
            <a
              href="/guide.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-system)',
                fontSize: '0.85em',
                textDecoration: 'none',
                opacity: guideFocused ? 1 : 0.6,
              }}
              onMouseEnter={() => {
                setGuideFocused(true);
              }}
              onMouseLeave={() => {
                setGuideFocused(false);
              }}
              onFocus={() => {
                setGuideFocused(true);
              }}
              onBlur={() => {
                setGuideFocused(false);
              }}>
              {'[ gameplay guide ]'}
            </a>
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
              onChange={() => {
                setError(false);
              }}
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
