// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommsPane } from './CommsPane';
import type { CommsHandle } from './CommsPane';
import { makeLine } from '../types/terminal';
import type { NexusMessage } from '../data/nexusMessages';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
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

// jsdom does no layout: 1000px of content in a 200px window, for every element.
const mockLayout = () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
};

const renderPane = (over: Partial<Props> = {}) => {
  const ref = createRef<CommsHandle>();
  const view = render(<CommsPane ref={ref} {...baseProps} {...over} />);
  const update = (next: Partial<Props>) => {
    view.rerender(<CommsPane ref={ref} {...baseProps} {...over} {...next} />);
  };
  return { ref, update, ...view };
};

const msg = (id: string): NexusMessage => ({
  id,
  trigger: 'trace_31',
  lines: [`line ${id}`, '— O.R.'],
});

const log = () => screen.getByRole('log');
const scrollTo = (top: number) => {
  log().scrollTop = top;
  fireEvent.scroll(log());
};

const sentinelProps: Partial<Props> = {
  sentinelEstablished: true,
  sentinelOpen: true,
  sentinelLines: [makeLine('output', 'sentinel >> I see you.')],
};

const showSentinel = () => {
  const utils = renderPane(sentinelProps);
  fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
  return utils;
};

describe('CommsPane scroll-back — the three bodies', () => {
  it('labels the NEXUS body as a log and opens it at the bottom', () => {
    mockLayout();
    renderPane({ nexusMessages: [msg('a'), msg('b')] });
    expect(log().getAttribute('aria-label')).toBe('NEXUS messages');
    expect(log().scrollTop).toBe(1000);
  });

  it('labels the SENTINEL body', () => {
    mockLayout();
    showSentinel();
    expect(log().getAttribute('aria-label')).toBe('SENTINEL channel');
  });

  it('labels the ARIA body with the tab name, and shows the read-only note', () => {
    mockLayout();
    renderPane({
      ariaLines: [{ ...makeLine('aria', 'hello'), id: 'aria-1-ai' }],
      ariaLabel: 'CASSANDRA',
    });
    fireEvent.click(screen.getByRole('tab', { name: 'CASSANDRA' }));
    expect(log().getAttribute('aria-label')).toBe('CASSANDRA channel');
    expect(screen.getByText(/read-only/i)).toBeTruthy();
  });
});

describe('CommsPane scroll-back — staying where the reader is', () => {
  it('NEXUS: a new message does not pull a reader who scrolled up, and offers a way down', () => {
    mockLayout();
    const { update } = renderPane({ nexusMessages: [msg('a')] });
    scrollTo(50);
    update({ nexusMessages: [msg('a'), msg('b')] });
    expect(log().scrollTop).toBe(50);
    fireEvent.click(screen.getByRole('button', { name: /jump to latest/i }));
    expect(log().scrollTop).toBe(1000);
  });

  it('NEXUS: the first-contact cut re-rendering the last message is not "new"', () => {
    mockLayout();
    vi.useFakeTimers();
    const { update } = renderPane({ nexusMessages: [msg('a')] });
    scrollTo(50);
    update({ nexusMessages: [msg('a')], sentinelEstablished: true, interruptKey: 1 });
    expect(screen.queryByRole('button', { name: /jump to latest/i })).toBeNull();
    vi.useRealTimers();
  });

  it('ARIA: re-rendering with an equal but new array does not yank the reader down', () => {
    mockLayout();
    const lines = () => [
      { ...makeLine('output', 'one'), id: 'aria-1-player' },
      { ...makeLine('aria', 'two'), id: 'aria-1-ai' },
    ];
    const { update } = renderPane({ ariaLines: lines() });
    fireEvent.click(screen.getByRole('tab', { name: 'CASSANDRA' }));
    scrollTo(50);
    update({ ariaLines: lines() }); // App rebuilds this array on every render
    expect(log().scrollTop).toBe(50);
    expect(screen.queryByRole('button', { name: /jump to latest/i })).toBeNull();
  });

  it('SENTINEL: a new line while scrolled up does not move the reader and shows the marker', () => {
    mockLayout();
    const { update } = renderPane(sentinelProps);
    fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
    scrollTo(50);
    update({
      sentinelLines: [
        makeLine('output', 'sentinel >> I see you.'),
        makeLine('output', 'sentinel >> still here.'),
      ],
    });
    expect(log().scrollTop).toBe(50);
    expect(screen.getByRole('button', { name: /jump to latest/i })).toBeTruthy();
  });
});

describe('CommsPane scroll-back — switching tabs', () => {
  it('opens every tab at its newest content, whatever the previous tab was doing', () => {
    mockLayout();
    renderPane({
      ...sentinelProps,
      ariaLines: [
        { ...makeLine('output', 'one'), id: 'aria-1-player' },
        { ...makeLine('aria', 'two'), id: 'aria-1-ai' },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
    scrollTo(50); // the reader leaves SENTINEL scrolled up
    fireEvent.click(screen.getByRole('tab', { name: 'CASSANDRA' }));
    expect(log().getAttribute('aria-label')).toBe('CASSANDRA channel');
    expect(log().scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: /jump to latest/i })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
    expect(log().scrollTop).toBe(1000);
  });
});

describe('CommsPane scroll-back — keyboard', () => {
  it('PageDown and PageUp in the Sentinel input scroll the log by most of a page', () => {
    mockLayout();
    showSentinel();
    scrollTo(300);
    const input = screen.getByTestId('comms-input');
    fireEvent.keyDown(input, { key: 'PageDown' });
    expect(log().scrollTop).toBe(300 + 180);
    fireEvent.keyDown(input, { key: 'PageUp' });
    expect(log().scrollTop).toBe(300);
  });

  it('Ctrl+Home and Ctrl+End in the Sentinel input jump to the top and the bottom', () => {
    mockLayout();
    showSentinel();
    scrollTo(300);
    const input = screen.getByTestId('comms-input');
    fireEvent.keyDown(input, { key: 'Home', ctrlKey: true });
    expect(log().scrollTop).toBe(0);
    fireEvent.keyDown(input, { key: 'End', ctrlKey: true });
    expect(log().scrollTop).toBe(1000);
  });

  it('leaves typing alone: the log does not move for arrows, Home, End or letters', () => {
    mockLayout();
    showSentinel();
    scrollTo(300);
    const input = screen.getByTestId('comms-input');
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'a']) {
      fireEvent.keyDown(input, { key });
    }
    expect(log().scrollTop).toBe(300);
    // Home, End and letters are not prevented either: the input keeps them.
    for (const key of ['Home', 'End', 'a']) {
      expect(fireEvent.keyDown(input, { key }), key).toBe(true);
    }
  });

  it('focus() puts the keyboard on the log when there is no input (NEXUS, ARIA)', () => {
    mockLayout();
    const { ref } = renderPane({ nexusMessages: [msg('a')] });
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => {
      ref.current?.focus();
    });
    expect(document.activeElement).toBe(log());
  });

  it('focus() falls back to the log when the Sentinel channel is closed (input disabled)', () => {
    mockLayout();
    const { ref } = renderPane({ ...sentinelProps, sentinelOpen: false });
    fireEvent.click(screen.getByRole('tab', { name: 'SENTINEL' }));
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => {
      ref.current?.focus();
    });
    expect(document.activeElement).toBe(log());
  });

  it('focus() still prefers the Sentinel input when its tab is showing', () => {
    mockLayout();
    const { ref } = showSentinel();
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => {
      ref.current?.focus();
    });
    expect(document.activeElement).toBe(screen.getByTestId('comms-input'));
  });
});
