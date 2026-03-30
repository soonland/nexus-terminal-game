import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  innerWidth: number;
  children: ReactNode;
  onClose: () => void;
}

const mono = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size)',
  lineHeight: 'var(--line-height)',
  whiteSpace: 'pre' as const,
  display: 'block' as const,
  margin: 0,
};

const CLOSE_LABEL = '[ CLOSE ]';

export const DosModal = ({ title, innerWidth: IW, children, onClose }: Props) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const titleFill = IW - title.length;
  const TOP = `╔${'═'.repeat(Math.floor(titleFill / 2))}${title}${'═'.repeat(Math.ceil(titleFill / 2))}╗`;
  const MID = `╠${'═'.repeat(IW)}╣`;
  const BOT = `╚${'═'.repeat(IW)}╝`;
  const cPad = Math.floor((IW - CLOSE_LABEL.length) / 2);
  const cRight = IW - CLOSE_LABEL.length - cPad;

  const borderColor = 'var(--color-output)';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 26, 0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}>
      <div style={{ position: 'relative' }}>
        {/* Drop shadow */}
        <div
          style={{
            position: 'absolute',
            top: 5,
            left: 5,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.7)',
          }}
        />
        {/* Box */}
        <div style={{ position: 'relative', background: 'var(--color-bg)' }}>
          <div style={{ ...mono, color: borderColor }}>{TOP}</div>

          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>{children}</div>

          <div style={{ ...mono, color: borderColor }}>{MID}</div>

          {/* Close row */}
          <div style={{ ...mono, color: borderColor, display: 'flex', alignItems: 'baseline' }}>
            <span>{`║${' '.repeat(cPad)}`}</span>
            <button
              ref={closeRef}
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-output)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size)',
                lineHeight: 'var(--line-height)',
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
              }}
              onFocus={e => {
                e.currentTarget.style.background = 'var(--color-output)';
                e.currentTarget.style.color = 'var(--color-bg)';
              }}
              onBlur={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--color-output)';
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--color-output)';
                e.currentTarget.style.color = 'var(--color-bg)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--color-output)';
              }}>
              {CLOSE_LABEL}
            </button>
            <span>{`${' '.repeat(cRight)}║`}</span>
          </div>

          <div style={{ ...mono, color: borderColor }}>{BOT}</div>
        </div>
      </div>
    </div>
  );
};
