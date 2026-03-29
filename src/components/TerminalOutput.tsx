import { useEffect, useRef } from 'react';
import type { TerminalLine } from '../types/terminal';

interface Props {
  lines: TerminalLine[];
}

export const TerminalOutput = ({ lines }: Props) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [lines]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        paddingTop: '0.75rem',
        paddingBottom: '0.5rem',
      }}>
      {lines.map(line => (
        <div key={line.id} className={`line line--${line.type}`}>
          {line.type === 'input' && '> '}
          {line.type === 'separator'
            ? '─────────────────────────────────────────────────────────────────────'
            : line.content}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
