// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { WelcomeScreen } from './WelcomeScreen';

describe('WelcomeScreen — type size', () => {
  it('sets its text two steps below the global size, on the screen and on the input', () => {
    const { container } = render(<WelcomeScreen onAgree={vi.fn()} />);
    const root = container.firstElementChild as HTMLElement;
    const input = container.querySelector('input') as HTMLInputElement;
    expect(root.style.fontSize).toBe('calc(var(--font-size) - 2px)');
    expect(input.style.fontSize).toBe('calc(var(--font-size) - 2px)');
  });

  it('keeps the photo backdrop class', () => {
    const { container } = render(<WelcomeScreen onAgree={vi.fn()} />);
    expect(container.firstElementChild?.className).toContain('desktop');
  });
});
