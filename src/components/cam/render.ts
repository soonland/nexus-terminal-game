import { WebGLRenderer } from 'three';
import type { CameraFeed } from '../../data/cameras';
import { buildScene, disposeScene } from './scenes';

export interface FeedHandle {
  setPaused: (paused: boolean) => void;
  stop: () => void;
}

const MAX_PIXEL_RATIO = 1.5;

// Starts a feed on `canvas`. `new WebGLRenderer` throws when WebGL is unavailable: the caller
// turns that into the NO SIGNAL card.
export const startFeed = (
  canvas: HTMLCanvasElement,
  feed: Pick<CameraFeed, 'scene' | 'mount'>,
  reducedMotion: boolean,
): FeedHandle => {
  const built = buildScene(feed);
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const start = performance.now();
  let frame = 0;
  let paused = false;
  let stopped = false;

  const draw = () => {
    built.update((performance.now() - start) / 1000);
    renderer.render(built.scene, built.camera);
  };

  const size = () => {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    renderer.setSize(width, height, false);
    built.camera.aspect = width / height;
    built.camera.updateProjectionMatrix();
  };
  // Resizing clears the canvas; with no loop running (a still frame, or paused) nothing else
  // would repaint it.
  const onResize = () => {
    size();
    if (reducedMotion || paused) draw();
  };
  const observer = new ResizeObserver(onResize);
  observer.observe(canvas);
  size();

  const loop = () => {
    if (stopped || paused || document.hidden) return;
    draw();
    frame = requestAnimationFrame(loop);
  };
  const resume = () => {
    cancelAnimationFrame(frame);
    if (reducedMotion) draw();
    else loop();
  };
  const onVisibility = () => {
    resume();
  };
  document.addEventListener('visibilitychange', onVisibility);
  resume();

  return {
    setPaused: next => {
      paused = next;
      resume();
    },
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      disposeScene(built.scene);
      renderer.dispose();
    },
  };
};
