// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CamPane } from './CamPane';
import { CAMERA_FEEDS } from '../data/cameras';

const stop = vi.fn();
const setPaused = vi.fn();
const startFeed = vi.fn();

vi.mock('./cam/render', () => ({
  startFeed: (...args: unknown[]) => startFeed(...args) as unknown,
}));

const FEEDS = CAMERA_FEEDS.filter(f =>
  ['lobby-reception', 'server-aisle', 'executive-corridor'].includes(f.id),
).map(f => ({ ...f, live: f.offlineReason === null }));

beforeEach(() => {
  stop.mockReset();
  setPaused.mockReset();
  startFeed.mockReset();
  startFeed.mockReturnValue({ stop, setPaused });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
  localStorage.clear();
});

const setup = (over: { visible?: boolean } = {}) => {
  const onToggleFullscreen = vi.fn();
  const view = render(
    <CamPane
      feeds={FEEDS}
      visible={over.visible ?? true}
      fullscreen={false}
      onToggleFullscreen={onToggleFullscreen}
    />,
  );
  return { onToggleFullscreen, ...view };
};

const pick = (floor: RegExp, camera: string) => {
  fireEvent.click(screen.getByRole('button', { name: /›/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: floor }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: new RegExp(camera) }));
};

describe('CamPane', () => {
  it('starts the first feed on its canvas and shows the CCTV overlay', async () => {
    setup();
    await screen.findByTestId('cam-canvas');
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledWith(
        screen.getByTestId('cam-canvas'),
        { scene: 'lobby', mount: 0 },
        false,
      );
    });
    expect(screen.getByTestId('cam-timestamp').textContent).toMatch(
      /^2024-11-27 \d{2}:\d{2}:\d{2}$/,
    );
    expect(screen.getByText('GROUND FLOOR — LOBBY (RECEPTION)')).toBeTruthy();
  });

  it('switches feeds, stopping the previous one', async () => {
    setup();
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(1);
    });
    pick(/OPERATIONS/, 'Server room \\(aisle\\)');
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(2);
    });
    expect(startFeed.mock.calls[1]?.[1]).toEqual({ scene: 'serverRoom', mount: 0 });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('shows the offline card for a disabled feed, with no renderer', () => {
    setup();
    pick(/EXECUTIVE/, 'Executive corridor');
    expect(screen.getByTestId('cam-offline').textContent).toContain('FEED DISABLED — CEO OFFICE');
    expect(screen.queryByTestId('cam-canvas')).toBeNull();
  });

  it('swaps the card for the scene when the selected feed goes live', async () => {
    const view = setup();
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(1);
    });
    pick(/EXECUTIVE/, 'Executive corridor');
    expect(screen.getByTestId('cam-offline')).toBeTruthy();
    expect(startFeed).toHaveBeenCalledTimes(1);

    const live = FEEDS.map(f => ({ ...f, live: true }));
    view.rerender(<CamPane feeds={live} visible fullscreen={false} onToggleFullscreen={vi.fn()} />);
    expect(screen.queryByTestId('cam-offline')).toBeNull();
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(2);
    });
    expect(startFeed.mock.calls[1]?.[1]).toEqual({ scene: 'executiveFloor', mount: 0 });
  });

  it('shows NO SIGNAL when WebGL is unavailable', async () => {
    startFeed.mockImplementation(() => {
      throw new Error('WebGL not supported');
    });
    setup();
    expect(await screen.findByTestId('cam-nosignal')).toBeTruthy();
  });

  it('pauses the feed while the pane is hidden and resumes when shown', async () => {
    const view = setup({ visible: true });
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalled();
    });
    view.rerender(
      <CamPane feeds={FEEDS} visible={false} fullscreen={false} onToggleFullscreen={vi.fn()} />,
    );
    expect(setPaused).toHaveBeenLastCalledWith(true);
    view.rerender(
      <CamPane feeds={FEEDS} visible fullscreen={false} onToggleFullscreen={vi.fn()} />,
    );
    expect(setPaused).toHaveBeenLastCalledWith(false);
  });

  it('does not start a renderer if it unmounts before the chunk resolves', async () => {
    const view = setup();
    view.unmount();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(startFeed).not.toHaveBeenCalled();
  });

  it('asks to toggle full screen', () => {
    const { onToggleFullscreen } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'FULL SCREEN' }));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('never uses the secret name', () => {
    const { container } = setup();
    expect(container.textContent).not.toMatch(/aria/i);
  });

  it('has night vision on by default and toggles it off and on', () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'NIGHT VISION' });
    const stage = screen.getByTestId('cam-stage');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(stage.className).toContain('cam-nv');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(stage.className).not.toContain('cam-nv');
    fireEvent.click(toggle);
    expect(stage.className).toContain('cam-nv');
  });

  it('remembers the night-vision choice when the tab is reopened', () => {
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: 'NIGHT VISION' }));
    first.unmount();
    setup();
    expect(screen.getByRole('button', { name: 'NIGHT VISION' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('does not restart the feed when night vision is toggled', async () => {
    setup();
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'NIGHT VISION' }));
    expect(startFeed).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });
});
