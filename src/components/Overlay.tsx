import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export const Overlay = ({ title, onClose, children }: Props) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        // The close button is the only focusable element: keep focus inside the dialog.
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="overlay-backdrop" role="presentation" onClick={onClose}>
      <div
        className="overlay"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => {
          e.stopPropagation();
        }}>
        <header className="pane-title">
          <span>{title}</span>
          <button ref={closeRef} type="button" aria-label={`Close ${title}`} onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="pane-body">{children}</div>
      </div>
    </div>
  );
};
