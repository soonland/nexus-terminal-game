// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MapModal } from './MapModal';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';

describe('MapModal', () => {
  it('shows discovered layer-5 nodes under neutral CASSANDRA labels, never Aria, before the reveal', () => {
    const state = produce(createInitialState(), s => {
      for (const n of Object.values(s.network.nodes)) {
        if (n?.layer === 5) n.discovered = true;
      }
    });
    const { container } = render(<MapModal gameState={state} />);
    expect(container.textContent).toMatch(/CASSANDRA/);
    expect(container.textContent).not.toMatch(/aria/i);
  });
});
