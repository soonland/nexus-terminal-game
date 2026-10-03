// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommsPane } from './CommsPane';

describe('CommsPane', () => {
  it('shows the Nexus line as the only channel and says nothing about Sentinel or Aria', () => {
    const { container } = render(<CommsPane />);
    expect(screen.getByText(/nexus/i)).toBeTruthy();
    expect(screen.getByText(/no traffic/i)).toBeTruthy();
    expect(container.textContent).not.toMatch(/sentinel|aria/i);
  });
});
