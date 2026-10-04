// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from './StatusBar';

const setup = (over: Partial<Parameters<typeof StatusBar>[0]> = {}) =>
  render(
    <StatusBar
      preset="hunt"
      focused="term"
      zoomed={null}
      nodeIp="10.0.0.1"
      trace={14}
      unread={[]}
      {...over}
    />,
  );

describe('StatusBar', () => {
  it('shows the preset, numbered panes with the focus marker, node ip and trace', () => {
    setup();
    expect(screen.getByText('[hunt]')).toBeTruthy();
    expect(screen.getByText('1:term*')).toBeTruthy();
    expect(screen.getByText('2:files')).toBeTruthy();
    expect(screen.getByText('5:comms')).toBeTruthy();
    expect(screen.getByText('10.0.0.1')).toBeTruthy();
    expect(screen.getByText('TRC 14%')).toBeTruthy();
  });

  it('marks the zoomed pane with Z', () => {
    setup({ focused: 'doc', zoomed: 'doc' });
    expect(screen.getByText('3:doc*Z')).toBeTruthy();
  });

  it('moves the focus marker with focus', () => {
    setup({ focused: 'aux' });
    expect(screen.getByText('4:aux*')).toBeTruthy();
    expect(screen.getByText('1:term')).toBeTruthy();
  });
});

describe('StatusBar — unread', () => {
  it('flags an unread pane', () => {
    setup({ unread: ['comms'] });
    expect(screen.getByText('5:comms!')).toBeTruthy();
    expect(screen.getByText('1:term*')).toBeTruthy();
  });
});
