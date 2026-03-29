import { getTraceLevel } from '../types/terminal';

interface Props {
  nodeIp: string;
  trace: number;
}

export const TerminalHeader = ({ nodeIp, trace }: Props) => {
  const level = getTraceLevel(trace);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.1rem 1.5rem',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-header)',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: '18px',
        userSelect: 'none',
      }}>
      <span style={{ color: 'var(--color-system)' }}>NEXUS OPS</span>

      {/* ncurses-style centered title: ┤ ip ├ */}
      <span style={{ color: 'var(--color-border)' }}>
        &#x2524;&nbsp;
        <span style={{ color: 'var(--color-output)' }}>{nodeIp}</span>
        &nbsp;&#x251C;
      </span>

      <span style={{ color: level.color }}>TRC {String(trace).padStart(3, ' ')}%</span>
    </header>
  );
};
