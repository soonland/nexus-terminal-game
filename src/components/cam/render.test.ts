// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Three from 'three';

const render = vi.fn();
const setSize = vi.fn();
let resizeCallback: () => void = () => undefined;

vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof Three>();
  class FakeRenderer {
    setPixelRatio = vi.fn();
    setSize = setSize;
    render = render;
    dispose = vi.fn();
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

beforeEach(() => {
  render.mockReset();
  setSize.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resizeCallback = cb;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});

describe('startFeed with reduced motion', () => {
  it('draws one still frame, and draws again after a resize wipes the canvas', async () => {
    const { startFeed } = await import('./render');
    const handle = startFeed(document.createElement('canvas'), 'cam_01', true);
    expect(render).toHaveBeenCalledTimes(1);
    resizeCallback();
    expect(render).toHaveBeenCalledTimes(2);
    handle.stop();
  });
});
