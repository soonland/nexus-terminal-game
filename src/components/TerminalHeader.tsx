interface Props {
  nodeIp: string;
}

// The trace readout lives on the COMMS pane (meter) and in the status bar.
export const TerminalHeader = ({ nodeIp }: Props) => {
  return (
    <header
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '3px 1.5rem',
        // Same flat title strip as the other panes (one palette across the workspace).
        borderBottom: '1px solid var(--win-border)',
        background: 'var(--win-titlebar-bg)',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        userSelect: 'none',
      }}>
      <span style={{ color: 'var(--color-system)' }}>NEXUS OPS</span>

      {/* ncurses-style centered title: ┤ ip ├ */}
      <span style={{ color: 'var(--color-border)' }}>
        &#x2524;&nbsp;
        <span style={{ color: 'var(--color-output)' }}>{nodeIp}</span>
        &nbsp;&#x251C;
      </span>

      <span />
    </header>
  );
};
