// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommsPane, INTERRUPT_MS, paneAlert } from './CommsPane';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

type Props = Parameters<typeof CommsPane>[0];

const baseProps: Props = {
  sentinelEstablished: false,
  sentinelOpen: false,
  sentinelLines: [],
  sentinelBusy: false,
  interruptKey: 0,
  onSend: vi.fn(),
  nexusMessages: [],
  ariaLines: [],
  ariaLabel: 'CASSANDRA',
  trace: 0,
};

const openProps: Partial<Props> = { sentinelEstablished: true, sentinelOpen: true };

describe('paneAlert — when the whole COMMS pane (frame, title strip, tint, trace line) is red', () => {
  it('only while the channel is open and the SENTINEL tab is shown', () => {
    expect(paneAlert(true, 'sentinel')).toBe(true);
    expect(paneAlert(true, 'nexus')).toBe(false);
    expect(paneAlert(true, 'aria')).toBe(false);
    expect(paneAlert(false, 'sentinel')).toBe(false);
    expect(paneAlert(false, 'nexus')).toBe(false);
  });
});

describe('CommsPane reports which tab is showing', () => {
  it('starts on NEXUS and follows the tab the player picks', () => {
    const onTabChange = vi.fn();
    // Established but closed: reopening a channel switches to its tab at once, so start closed.
    render(<CommsPane {...baseProps} sentinelEstablished onTabChange={onTabChange} />);
    expect(onTabChange).toHaveBeenLastCalledWith('nexus');
    fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
    expect(onTabChange).toHaveBeenLastCalledWith('sentinel');
    fireEvent.click(screen.getByRole('tab', { name: 'NEXUS' }));
    expect(onTabChange).toHaveBeenLastCalledWith('nexus');
  });

  it('stays on NEXUS during the first-contact cut, then reports SENTINEL', () => {
    vi.useFakeTimers();
    const onTabChange = vi.fn();
    const { rerender } = render(<CommsPane {...baseProps} onTabChange={onTabChange} />);
    rerender(
      <CommsPane {...baseProps} {...openProps} interruptKey={1} onTabChange={onTabChange} />,
    );
    expect(onTabChange).toHaveBeenLastCalledWith('nexus');
    act(() => {
      vi.advanceTimersByTime(INTERRUPT_MS);
    });
    expect(onTabChange).toHaveBeenLastCalledWith('sentinel');
  });

  it('goes back to NEXUS when a new run clears the channel', () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <CommsPane {...baseProps} {...openProps} onTabChange={onTabChange} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
    expect(onTabChange).toHaveBeenLastCalledWith('sentinel');
    rerender(<CommsPane {...baseProps} onTabChange={onTabChange} />);
    expect(onTabChange).toHaveBeenLastCalledWith('nexus');
  });
});
