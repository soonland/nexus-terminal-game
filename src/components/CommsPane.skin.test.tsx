// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommsPane, INTERRUPT_MS } from './CommsPane';
import { makeLine } from '../types/terminal';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

type Props = Parameters<typeof CommsPane>[0];

const baseProps: Props = {
  sentinelEstablished: true,
  sentinelOpen: true,
  sentinelLines: [],
  sentinelBusy: false,
  interruptKey: 0,
  onSend: vi.fn(),
  nexusMessages: [
    { id: 'layer_3', trigger: 'layer_3', lines: ['Finance. Follow the money.', '— O.R.'] },
  ],
  ariaLines: [],
  ariaLabel: 'CASSANDRA',
  trace: 0,
};

const skin = (container: HTMLElement): string | null =>
  container.querySelector('.comms-view')?.getAttribute('data-skin') ?? null;

// Sentinel's red belongs to Sentinel's tab: Rhee's Nexus line must not be drawn in it, even while
// the channel is open and the pane's frame is in alert.
describe('CommsPane — the red skin belongs to the SENTINEL tab', () => {
  it('draws the NEXUS tab in the calm palette while Sentinel is open', () => {
    const { container } = render(<CommsPane {...baseProps} />);
    // An open channel brings the SENTINEL tab forward; the player can go back to the Nexus line.
    fireEvent.click(screen.getByRole('tab', { name: 'NEXUS' }));
    expect(screen.getByRole('tab', { name: 'NEXUS' }).getAttribute('aria-selected')).toBe('true');
    expect(skin(container)).toBe('calm');
  });

  it('draws the SENTINEL tab in the alert palette', () => {
    const { container } = render(<CommsPane {...baseProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
    expect(skin(container)).toBe('alert');
  });

  it('returns to the calm palette when the player goes back to NEXUS', () => {
    const { container } = render(<CommsPane {...baseProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
    fireEvent.click(screen.getByRole('tab', { name: 'NEXUS' }));
    expect(skin(container)).toBe('calm');
  });

  it('is calm on a closed Sentinel channel, where the pane is no longer in alert', () => {
    const { container } = render(<CommsPane {...baseProps} sentinelOpen={false} />);
    fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
    expect(skin(container)).toBe('calm');
  });

  it('is alert during the first-contact interruption, and stays alert on the SENTINEL tab', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <CommsPane {...baseProps} sentinelEstablished={false} sentinelOpen={false} />,
    );
    expect(skin(container)).toBe('calm');
    rerender(<CommsPane {...baseProps} interruptKey={1} />);
    expect(skin(container)).toBe('alert');
    act(() => {
      vi.advanceTimersByTime(INTERRUPT_MS);
    });
    expect(screen.getByRole('tab', { name: 'SENTINEL' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(skin(container)).toBe('alert');
  });

  it('draws the Cassandra/Aria tab in the calm palette', () => {
    const { container } = render(
      <CommsPane {...baseProps} ariaLines={[{ ...makeLine('aria', 'hello'), id: 'aria-1-ai' }]} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'CASSANDRA' }));
    expect(skin(container)).toBe('calm');
  });
});
