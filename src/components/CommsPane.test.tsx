// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommsPane, INTERRUPT_MS } from './CommsPane';
import type { CommsHandle } from './CommsPane';
import { makeLine } from '../types/terminal';
import type { NexusMessage } from '../data/nexusMessages';

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

const renderPane = (over: Partial<Props> = {}) => {
  const ref = createRef<CommsHandle>();
  const view = render(<CommsPane ref={ref} {...baseProps} {...over} />);
  const update = (next: Partial<Props>) => {
    view.rerender(<CommsPane ref={ref} {...baseProps} {...over} {...next} />);
  };
  return { ref, update, ...view };
};

const tab = (name: string) => screen.getByRole('tab', { name });

describe('CommsPane — before first contact', () => {
  it('shows the Nexus line only, with no tab strip and no mention of Sentinel or Aria', () => {
    const { container } = renderPane();
    expect(screen.getByText(/nexus \/\/ encrypted line/i)).toBeTruthy();
    expect(screen.getByText(/line open — no traffic/i)).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/sentinel|aria/i);
  });
});

describe('CommsPane — first contact interruption', () => {
  it('cuts into the Nexus line, then switches to the Sentinel tab', () => {
    vi.useFakeTimers();
    const { update } = renderPane();
    update({ sentinelEstablished: true, sentinelOpen: true, interruptKey: 1 });
    expect(screen.getByText(/signal lost/i)).toBeTruthy();
    expect(tab('NEXUS').getAttribute('aria-selected')).toBe('true');
    expect(tab('SENTINEL').className).toContain('comms-flicker');
    expect(screen.queryByTestId('comms-input')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(INTERRUPT_MS);
    });
    expect(tab('SENTINEL').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('comms-input')).toBeTruthy();
    expect(tab('SENTINEL').className).not.toContain('comms-flicker');
  });

  it('goes quiet on the Nexus tab afterwards', () => {
    vi.useFakeTimers();
    const { update } = renderPane();
    update({ sentinelEstablished: true, sentinelOpen: true, interruptKey: 1 });
    act(() => {
      vi.advanceTimersByTime(INTERRUPT_MS);
    });
    fireEvent.click(tab('NEXUS'));
    expect(screen.getByText(/line quiet/i)).toBeTruthy();
  });

  it('does not interrupt again for the same key and clears its timer on unmount', () => {
    vi.useFakeTimers();
    const { update, unmount } = renderPane();
    update({ sentinelEstablished: true, sentinelOpen: true, interruptKey: 1 });
    update({
      sentinelEstablished: true,
      sentinelOpen: true,
      interruptKey: 1,
      sentinelLines: [makeLine('output', 'x')],
    });
    expect(screen.getByText(/signal lost/i)).toBeTruthy();
    unmount();
    expect(() => {
      vi.advanceTimersByTime(INTERRUPT_MS * 2);
    }).not.toThrow();
  });
});

describe('CommsPane — repeated interruption keys', () => {
  it('restarts the window on a second bump and still ends on the Sentinel tab (never stuck)', () => {
    vi.useFakeTimers();
    const { update } = renderPane();
    const props = { sentinelEstablished: true, sentinelOpen: true };
    update({ ...props, interruptKey: 1 });
    act(() => {
      vi.advanceTimersByTime(INTERRUPT_MS - 100);
    });
    update({ ...props, interruptKey: 2 });
    act(() => {
      vi.advanceTimersByTime(INTERRUPT_MS - 100);
    });
    expect(screen.getByText(/signal lost/i)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(tab('SENTINEL').getAttribute('aria-selected')).toBe('true');
    expect(tab('SENTINEL').className).not.toContain('comms-flicker');
    expect(screen.queryByText(/signal lost/i)).toBeNull();
  });
});

describe('CommsPane — restored and reopened channels', () => {
  it('shows a closed Sentinel tab for a restored save, with NEXUS selected and a quiet line', () => {
    renderPane({ sentinelEstablished: true });
    expect(tab('NEXUS').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/line quiet/i)).toBeTruthy();
    fireEvent.click(tab('SENTINEL'));
    expect(screen.getByText(/channel closed/i)).toBeTruthy();
    expect(screen.getByTestId<HTMLInputElement>('comms-input').disabled).toBe(true);
  });

  it('switches to the Sentinel tab at once when the channel reopens without an interruption', () => {
    const { update } = renderPane({ sentinelEstablished: true });
    update({ sentinelOpen: true });
    expect(tab('SENTINEL').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId<HTMLInputElement>('comms-input').disabled).toBe(false);
  });

  it('returns to a bare Nexus line when a new run clears the channel', () => {
    const { update } = renderPane({ sentinelEstablished: true, sentinelOpen: true });
    fireEvent.click(tab('SENTINEL'));
    update({ sentinelEstablished: false, sentinelOpen: false });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText(/line open — no traffic/i)).toBeTruthy();
  });
});

describe('CommsPane — Sentinel channel view', () => {
  const openProps: Partial<Props> = { sentinelEstablished: true, sentinelOpen: true };

  const showSentinel = (over: Partial<Props> = {}) => {
    const utils = renderPane({ ...openProps, ...over });
    fireEvent.click(tab('SENTINEL'));
    return utils;
  };

  it('renders the channel lines', () => {
    showSentinel({ sentinelLines: [makeLine('output', 'sentinel >> I see you.')] });
    expect(screen.getByText('sentinel >> I see you.')).toBeTruthy();
  });

  it('sends the typed text on Enter and shows the ghost prompt', () => {
    const onSend = vi.fn();
    showSentinel({ onSend });
    expect(screen.getByText('ghost >>')).toBeTruthy();
    const input = screen.getByTestId('comms-input');
    fireEvent.change(input, { target: { value: 'who are you' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('who are you');
  });

  it('shows a busy line and keeps the input enabled while a reply is pending', () => {
    showSentinel({ sentinelBusy: true });
    expect(screen.getByText(/sentinel >> …/)).toBeTruthy();
    expect(screen.getByTestId<HTMLInputElement>('comms-input').disabled).toBe(false);
  });

  it('shows the closed hint and disables the input when the channel is closed', () => {
    showSentinel({ sentinelOpen: false });
    expect(screen.getByText(/channel closed/i)).toBeTruthy();
    expect(screen.getByTestId<HTMLInputElement>('comms-input').disabled).toBe(true);
  });

  it('focus() focuses the input when the Sentinel tab is showing, and is a no-op otherwise', () => {
    const { ref } = showSentinel();
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => {
      ref.current?.focus();
    });
    expect(document.activeElement).toBe(screen.getByTestId('comms-input'));
    fireEvent.click(tab('NEXUS'));
    expect(() => {
      ref.current?.focus();
    }).not.toThrow();
  });

  it('typing in the comms input does not move focus elsewhere when other inputs re-enable', () => {
    showSentinel();
    const input = screen.getByTestId('comms-input');
    input.focus();
    expect(document.activeElement).toBe(input);
  });
});

const A: NexusMessage = {
  id: 'a',
  trigger: 'mission_start',
  lines: ['Uplink verified, ghost.', '— O.R.'],
};
const B: NexusMessage = {
  id: 'b',
  trigger: 'trace_31',
  lines: ['You are on a watchlist now. That is normal.', 'Slow down anyway.', '— O.R.'],
};

describe('CommsPane — the scripted Nexus line', () => {
  it('shows every received message and the receive-only note, not the empty-line text', () => {
    renderPane({ nexusMessages: [A, B] });
    expect(screen.getByText('Uplink verified, ghost.')).toBeTruthy();
    expect(screen.getByText('Slow down anyway.')).toBeTruthy();
    expect(screen.getAllByText('— O.R.')).toHaveLength(2);
    expect(screen.getByText(/\[ENCRYPTED LINE — RECEIVE ONLY\]/)).toBeTruthy();
    expect(screen.queryByText(/line open — no traffic/i)).toBeNull();
  });

  it('keeps the empty-line text when nothing has arrived', () => {
    renderPane();
    expect(screen.getByText(/line open — no traffic/i)).toBeTruthy();
    expect(screen.getByText(/\[ENCRYPTED LINE — RECEIVE ONLY\]/)).toBeTruthy();
  });

  it('the receive-only line has no input to type in', () => {
    renderPane({ nexusMessages: [A] });
    expect(screen.queryByTestId('comms-input')).toBeNull();
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });

  it('a Sentinel interruption breaks the last message off mid-sentence', () => {
    vi.useFakeTimers();
    const { update } = renderPane({ nexusMessages: [A, B] });
    update({ sentinelEstablished: true, sentinelOpen: true, interruptKey: 1 });
    expect(screen.getByText('Uplink verified, ghost.')).toBeTruthy(); // earlier messages intact
    expect(screen.getByText(/signal lost/i)).toBeTruthy();
    expect(screen.queryByText('Slow down anyway.')).toBeNull(); // the rest of the cut message is gone
    expect(screen.queryByText('You are on a watchlist now. That is normal.')).toBeNull(); // cut short
    expect(document.body.textContent).toContain('You are on a');
  });

  it('after the interruption the Nexus tab keeps its history and goes quiet', () => {
    vi.useFakeTimers();
    const { update } = renderPane({ nexusMessages: [A, B] });
    update({ sentinelEstablished: true, sentinelOpen: true, interruptKey: 1 });
    act(() => {
      vi.advanceTimersByTime(INTERRUPT_MS);
    });
    fireEvent.click(tab('NEXUS'));
    expect(screen.getByText('Slow down anyway.')).toBeTruthy();
    expect(screen.getByText(/line quiet/i)).toBeTruthy();
  });

  it('never mentions Sentinel or the secret name before first contact', () => {
    const { container } = renderPane({ nexusMessages: [A, B] });
    expect(container.textContent).not.toMatch(/sentinel|aria|cassandra/i);
  });
});

describe('CommsPane — the ARIA / CASSANDRA tab', () => {
  const lines = [makeLine('output', 'ghost >> hello'), makeLine('aria', 'who is asking.')];

  it('has no such tab until she has spoken', () => {
    renderPane();
    expect(screen.queryByRole('tab', { name: /cassandra|aria/i })).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('appears at the first exchange under the label it is given, and shows her lines', () => {
    const { update } = renderPane();
    update({ ariaLines: lines, ariaLabel: 'CASSANDRA' });
    expect(tab('CASSANDRA').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('who is asking.')).toBeTruthy();
    expect(screen.getByText('ghost >> hello')).toBeTruthy();
  });

  it('uses the real name once it is known', () => {
    renderPane({ ariaLines: lines, ariaLabel: 'ARIA' });
    expect(tab('ARIA')).toBeTruthy();
  });

  it('is read-only: it has no input and says where to answer', () => {
    renderPane({ ariaLines: lines });
    fireEvent.click(tab('CASSANDRA')); // a resumed game does not switch to the tab on its own
    expect(screen.queryByTestId('comms-input')).toBeNull();
    expect(document.querySelectorAll('input')).toHaveLength(0);
    expect(screen.getByText(/answer from the terminal/i)).toBeTruthy();
  });

  it('a new reply switches to the tab but does not take focus from the terminal', () => {
    const { update } = renderPane({ ariaLines: [lines[0]] });
    const before = document.activeElement;
    update({ ariaLines: lines });
    expect(tab('CASSANDRA').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(before);
  });

  it('coexists with the Sentinel tab, and tabs switch both ways', () => {
    renderPane({
      ariaLines: lines,
      sentinelEstablished: true,
      sentinelOpen: true,
      sentinelLines: [makeLine('output', 'sentinel >> I see you.')],
    });
    fireEvent.click(tab('SENTINEL'));
    expect(screen.getByText('sentinel >> I see you.')).toBeTruthy();
    expect(screen.queryByText('who is asking.')).toBeNull();
    fireEvent.click(tab('CASSANDRA'));
    expect(screen.getByText('who is asking.')).toBeTruthy();
    fireEvent.click(tab('NEXUS'));
    expect(screen.getByText(/nexus \/\/ encrypted line/i)).toBeTruthy();
  });

  it('a new run (no lines, no channel) goes back to the bare Nexus line', () => {
    const { update } = renderPane({ ariaLines: lines });
    update({ ariaLines: [] });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText(/nexus \/\/ encrypted line/i)).toBeTruthy();
  });
});

describe('CommsPane — trace meter', () => {
  it('shows the meter along the top edge on every tab', () => {
    renderPane({ trace: 64 });
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('64');
    const root = document.querySelector('.comms')!;
    expect(root.firstElementChild).toBe(screen.getByRole('meter'));
  });

  it('follows the trace as it changes', () => {
    const { update } = renderPane({ trace: 10 });
    update({ trace: 88 });
    expect(screen.getByRole('meter').getAttribute('data-level')).toBe('aggressive');
  });
});
