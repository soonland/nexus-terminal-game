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
  id: CameraFeed['id'],
  reducedMotion: boolean,
): FeedHandle => {
  const built = buildScene(id);
  if (built === null) throw new Error(`feed ${id} has no scene`);
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const resize = () => {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    renderer.setSize(width, height, false);
    built.camera.aspect = width / height;
    built.camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const start = performance.now();
  let frame = 0;
  let paused = false;
  let stopped = false;

  const draw = () => {
    built.update((performance.now() - start) / 1000);
    renderer.render(built.scene, built.camera);
  };
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
