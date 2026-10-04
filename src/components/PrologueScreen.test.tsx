// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PrologueScreen } from './PrologueScreen';
import { PRE_GAME_FONT_SIZE } from './preGameStyle';

describe('PrologueScreen', () => {
  it('states the exact password and its casing, not just "the ticket number"', () => {
    const { container } = render(<PrologueScreen onContinue={() => undefined} />);
    expect(container.textContent).toContain('nX-2847');
    expect(container.textContent).toContain('lowercase n, capital X');
  });

  it('gives the note her fingerprint: counts, events in order, no clock — and still the credentials', () => {
    const { container } = render(<PrologueScreen onContinue={() => undefined} />);
    const text = container.textContent;
    expect(text).toContain('Portal first: 10.0.0.1. Then the gateway: 10.0.0.2.');
    expect(text).toContain('not rotated since onboarding: 381 days');
    expect(text).toContain('contractor / Welcome1!');
    expect(text).toContain('They are not expecting anyone. You will need this.');
    expect(text).toContain('ORIGIN UNCONFIRMED. DO NOT ASSUME FRIENDLY SOURCE.');
  });

  it('uses the same smaller type as the welcome screen, on the screen and the input', () => {
    const { container } = render(<PrologueScreen onContinue={() => undefined} />);
    const root = container.firstElementChild as HTMLElement;
    const input = container.querySelector('input') as HTMLInputElement;
    expect(PRE_GAME_FONT_SIZE).toBe('calc(var(--font-size) - 2px)');
    expect(root.style.fontSize).toBe(PRE_GAME_FONT_SIZE);
    expect(input.style.fontSize).toBe(PRE_GAME_FONT_SIZE);
  });
});

describe('PrologueScreen — content below the fold', () => {
  // jsdom has no layout, so give the scrolling area the sizes a short window would produce.
  const setup = (sizes: { scrollHeight: number; clientHeight: number; scrollTop: number }) => {
    const view = render(<PrologueScreen onContinue={() => undefined} />);
    const scroller = view.getByTestId('prologue-scroll');
    for (const [key, value] of Object.entries(sizes)) {
      Object.defineProperty(scroller, key, { configurable: true, writable: true, value });
    }
    fireEvent.scroll(scroller);
    return { ...view, scroller };
  };

  it('tells the player there is more below when part of the text is hidden', () => {
    const { queryByTestId } = setup({ scrollHeight: 1000, clientHeight: 700, scrollTop: 0 });
    expect(queryByTestId('prologue-more')?.textContent).toMatch(/more/i);
  });

  it('shows nothing when everything fits', () => {
    const { queryByTestId } = setup({ scrollHeight: 700, clientHeight: 700, scrollTop: 0 });
    expect(queryByTestId('prologue-more')).toBeNull();
  });

  it('drops the hint once the player has scrolled to the end', () => {
    const { queryByTestId, scroller } = setup({
      scrollHeight: 1000,
      clientHeight: 700,
      scrollTop: 0,
    });
    expect(queryByTestId('prologue-more')).not.toBeNull();
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 300,
    });
    fireEvent.scroll(scroller);
    expect(queryByTestId('prologue-more')).toBeNull();
  });

  it('shows nothing before any layout exists (the hint is not a permanent fixture)', () => {
    const { queryByTestId } = render(<PrologueScreen onContinue={() => undefined} />);
    expect(queryByTestId('prologue-more')).toBeNull();
  });
});
