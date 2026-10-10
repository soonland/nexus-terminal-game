import { useEffect, useRef } from 'react';
import type { TerminalLine } from '../types/terminal';
import { StickyScroller } from './StickyScroller';

interface Props {
  lines: TerminalLine[];
  // Opt-in for the COMMS channels: follow new lines only while the reader is at the bottom, so
  // scrolling back sticks. The terminal keeps jumping to the newest line on every change.
  followBottom?: boolean;
  // Names the log when followBottom is set.
  label?: string;
}

export const TerminalOutput = ({ lines, followBottom = false, label = 'Output' }: Props) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!followBottom) bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [lines, followBottom]);

  const rows = lines.map(line => (
    <div key={line.id} className={`line line--${line.type}`}>
      {line.type === 'input' && '> '}
      {line.type === 'separator'
        ? '─────────────────────────────────────────────────────────────────────'
        : line.content}
    </div>
  ));

  if (followBottom) {
    // Keyed on the newest line, not on the array: callers may rebuild an equal array every render.
    return (
      <StickyScroller
        contentKey={`${String(lines.length)}:${lines.at(-1)?.id ?? ''}`}
        label={label}
        className="comms-log">
        {rows}
      </StickyScroller>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        paddingTop: '0.75rem',
        paddingBottom: '0.5rem',
      }}>
      {rows}
      <div ref={bottomRef} />
    </div>
  );
};
