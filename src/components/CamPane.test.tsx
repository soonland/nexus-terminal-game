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

beforeEach(() => {
  stop.mockReset();
  setPaused.mockReset();
  startFeed.mockReset();
  startFeed.mockReturnValue({ stop, setPaused });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
});

const setup = (over: { visible?: boolean } = {}) => {
  const onToggleFullscreen = vi.fn();
  const view = render(
    <CamPane
      feeds={CAMERA_FEEDS}
      visible={over.visible ?? true}
      fullscreen={false}
      onToggleFullscreen={onToggleFullscreen}
    />,
  );
  return { onToggleFullscreen, ...view };
};

describe('CamPane', () => {
  it('starts the first feed on its canvas and shows the CCTV overlay', async () => {
    setup();
    await screen.findByTestId('cam-canvas');
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledWith(screen.getByTestId('cam-canvas'), 'cam_01', false);
    });
    expect(screen.getByTestId('cam-timestamp').textContent).toMatch(
      /^2024-11-27 \d{2}:\d{2}:\d{2}$/,
    );
    expect(screen.getByText('CAM 01 — LOBBY')).toBeTruthy();
  });

  it('switches feeds, stopping the previous one', async () => {
    setup();
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'CAM 02' }));
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(2);
    });
    expect(startFeed.mock.calls[1]?.[1]).toBe('cam_02');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('shows the offline card for the disabled feed, with no renderer', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'CAM 03' }));
    expect(screen.getByTestId('cam-offline').textContent).toContain('FEED DISABLED — CEO OFFICE');
    expect(screen.queryByTestId('cam-canvas')).toBeNull();
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
      <CamPane
        feeds={CAMERA_FEEDS}
        visible={false}
        fullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );
    expect(setPaused).toHaveBeenLastCalledWith(true);
    view.rerender(
      <CamPane feeds={CAMERA_FEEDS} visible fullscreen={false} onToggleFullscreen={vi.fn()} />,
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
});
