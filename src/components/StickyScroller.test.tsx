// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StickyScroller } from './StickyScroller';

// jsdom does no layout: give every element a fixed 1000px of content in a 200px window.
const mockLayout = (scrollHeight = 1000, clientHeight = 200) => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
};

afterEach(() => {
  vi.restoreAllMocks();
});

const log = () => screen.getByRole('log');

const scrollTo = (top: number) => {
  log().scrollTop = top;
  fireEvent.scroll(log());
};

const view = (key: string | number, label = 'NEXUS messages') => (
  <StickyScroller contentKey={key} label={label} className="body">
    <div>content {key}</div>
  </StickyScroller>
);

describe('StickyScroller', () => {
  it('opens at the bottom', () => {
    mockLayout();
    render(view(1));
    expect(log().scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: /latest/i })).toBeNull();
  });

  it('is a focusable, labelled log', () => {
    mockLayout();
    render(view(1, 'SENTINEL channel'));
    expect(log().getAttribute('aria-label')).toBe('SENTINEL channel');
    expect(log().tabIndex).toBe(0);
  });

  it('follows new content while the reader is at the bottom', () => {
    mockLayout();
    const { rerender } = render(view(1));
    scrollTo(800); // exactly at the bottom
    log().scrollTop = 500; // content grew since: it is no longer where it was
    rerender(view(2));
    expect(log().scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: /latest/i })).toBeNull();
  });

  it('treats the last 24px as the bottom', () => {
    mockLayout();
    const { rerender } = render(view(1));
    scrollTo(776); // 1000 - 200 - 776 = 24 px from the bottom
    rerender(view(2));
    expect(log().scrollTop).toBe(1000);
  });

  it('stays where it is once the reader scrolled up, and offers a way down', () => {
    mockLayout();
    const { rerender } = render(view(1));
    scrollTo(100);
    rerender(view(2));
    expect(log().scrollTop).toBe(100);
    expect(screen.getByRole('button', { name: /latest/i })).toBeTruthy();
  });

  it('jumps to the bottom and clears the marker when it is clicked', () => {
    mockLayout();
    const { rerender } = render(view(1));
    scrollTo(100);
    rerender(view(2));
    fireEvent.click(screen.getByRole('button', { name: /latest/i }));
    expect(log().scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: /latest/i })).toBeNull();
    // and it follows again afterwards
    rerender(view(3));
    expect(log().scrollTop).toBe(1000);
  });

  it('clears the marker when the reader scrolls back down by hand', () => {
    mockLayout();
    const { rerender } = render(view(1));
    scrollTo(100);
    rerender(view(2));
    scrollTo(790);
    expect(screen.queryByRole('button', { name: /latest/i })).toBeNull();
  });

  it('does not mark anything new when the content has not changed', () => {
    mockLayout();
    const { rerender } = render(view(1));
    scrollTo(100);
    rerender(view(1));
    expect(log().scrollTop).toBe(100);
    expect(screen.queryByRole('button', { name: /latest/i })).toBeNull();
  });

  describe('when the log is resized', () => {
    const observers: Array<() => void> = [];
    const observed: Element[] = [];

    const fakeResizeObserver = () => {
      observers.length = 0;
      observed.length = 0;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            observers.push(callback);
          }
          observe(target: Element) {
            observed.push(target);
          }
          disconnect() {}
        },
      );
    };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('watches both the window and the content', () => {
      mockLayout();
      fakeResizeObserver();
      render(view(1));
      expect(observed).toContain(log());
      expect(observed).toContain(log().firstElementChild);
    });

    it('stays at the bottom if the reader was at the bottom', () => {
      mockLayout();
      fakeResizeObserver();
      render(view(1));
      log().scrollTop = 800; // layout shifted: no longer pinned
      for (const callback of observers) callback();
      expect(log().scrollTop).toBe(1000);
    });

    it('leaves a reader who scrolled up alone', () => {
      mockLayout();
      fakeResizeObserver();
      render(view(1));
      scrollTo(100);
      for (const callback of observers) callback();
      expect(log().scrollTop).toBe(100);
    });
  });
});
