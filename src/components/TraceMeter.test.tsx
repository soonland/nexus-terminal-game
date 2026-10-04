// @vitest-environment jsdom
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TraceMeter } from './TraceMeter';

// The stylesheet as text (Vitest blanks CSS imports, so read the file).
const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

const meter = () => screen.getByRole('meter');
const fill = () => meter().querySelector<HTMLElement>('.trace-meter-fill')!;

describe('TraceMeter', () => {
  it('exposes the trace as a 0–100 meter and sizes the fill to it', () => {
    render(<TraceMeter trace={42} />);
    expect(meter().getAttribute('aria-valuenow')).toBe('42');
    expect(meter().getAttribute('aria-valuemin')).toBe('0');
    expect(meter().getAttribute('aria-valuemax')).toBe('100');
    expect(fill().style.width).toBe('42%');
  });

  it.each([
    [0, 'safe'],
    [30, 'safe'],
    [31, 'elevated'],
    [60, 'elevated'],
    [61, 'active'],
    [85, 'active'],
    [86, 'aggressive'],
    [99, 'aggressive'],
    [100, 'burned'],
  ])('trace %i is level %s', (trace, level) => {
    render(<TraceMeter trace={trace} />);
    expect(meter().getAttribute('data-level')).toBe(level);
  });

  it('clamps out-of-range values', () => {
    const { rerender } = render(<TraceMeter trace={140} />);
    expect(fill().style.width).toBe('100%');
    expect(meter().getAttribute('aria-valuenow')).toBe('100');
    rerender(<TraceMeter trace={-5} />);
    expect(fill().style.width).toBe('0%');
  });
});

describe('trace meter styling', () => {
  // Everything outside the `prefers-reduced-motion: no-preference` blocks.
  const outsideMotionQuery = css.replace(
    /@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g,
    '',
  );

  it('only animates when the user has not asked for reduced motion', () => {
    expect(outsideMotionQuery).not.toMatch(/\.trace-meter-fill\s*\{[^}]*transition/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.trace-meter-fill\s*\{[^}]*transition/,
    );
  });

  it('keeps every motion rule behind the reduced-motion query', () => {
    expect(outsideMotionQuery).not.toMatch(/animation\s*:/);
  });
});
