import { useEffect, useRef, useState } from 'react';
import { floorName } from '../data/cameras';
import type { ListedFeed } from '../engine/cameras';

interface Props {
  feeds: readonly ListedFeed[];
  // False while the aux pane is hidden (another pane zoomed, another narrow tab).
  visible: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

const STORY_DATE = '2024-11-27';
const NIGHT_VISION_KEY = 'irongate_cam_night_vision';

// A per-viewer convenience: on by default, remembered when the tab is closed and reopened.
const readNightVision = (): boolean => {
  try {
    return localStorage.getItem(NIGHT_VISION_KEY) !== 'off';
  } catch {
    return true;
  }
};

const writeNightVision = (on: boolean): void => {
  try {
    localStorage.setItem(NIGHT_VISION_KEY, on ? 'on' : 'off');
  } catch {
    // Storage can be blocked; the choice then lasts until the tab closes.
  }
};

// The story's date with the real time of day: decoration, not game time.
const readStamp = (): string => `${STORY_DATE} ${new Date().toTimeString().slice(0, 8)}`;

const useStamp = (): string => {
  const [stamp, setStamp] = useState(readStamp);
  useEffect(() => {
    const timer = setInterval(() => {
      setStamp(readStamp());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return stamp;
};

interface FeedHandleLike {
  setPaused: (paused: boolean) => void;
  stop: () => void;
}

// three.js is loaded on first use, so the main bundle never carries it.
const Canvas = ({ feed, visible }: { feed: ListedFeed; visible: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<FeedHandleLike | null>(null);
  const { id, scene, mount } = feed;
  const visibleRef = useRef(visible);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    visibleRef.current = visible;
    handleRef.current?.setPaused(!visible);
  }, [visible]);

  useEffect(() => {
    let cancelled = false;
    import('./cam/render')
      .then(({ startFeed }) => {
        const canvas = canvasRef.current;
        if (cancelled || canvas === null) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const handle = startFeed(canvas, { scene, mount }, reduced);
        handle.setPaused(!visibleRef.current);
        handleRef.current = handle;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [id, scene, mount]);

  if (failed) {
    return (
      <div className="cam-card" data-testid="cam-nosignal">
        NO SIGNAL
      </div>
    );
  }
  return <canvas ref={canvasRef} className="cam-canvas" data-testid="cam-canvas" />;
};

export const CamPane = ({ feeds, visible, fullscreen, onToggleFullscreen }: Props) => {
  const first = feeds.at(0);
  const [selected, setSelected] = useState(first?.id);
  const stamp = useStamp();
  const [nightVision, setNightVision] = useState(readNightVision);
  const feed = feeds.find(f => f.id === selected) ?? first;
  if (feed === undefined) return null;

  return (
    <div className="cam-pane">
      <div className="cam-bar">
        {feeds.map(f => (
          <button
            key={f.id}
            type="button"
            aria-pressed={f.id === feed.id}
            onClick={() => {
              setSelected(f.id);
            }}>
            {f.name}
          </button>
        ))}
        <button
          type="button"
          className="cam-nv-toggle"
          aria-pressed={nightVision}
          onClick={() => {
            writeNightVision(!nightVision);
            setNightVision(!nightVision);
          }}>
          NIGHT VISION
        </button>
        <button type="button" className="cam-full" onClick={onToggleFullscreen}>
          {fullscreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}
        </button>
      </div>
      <div className={nightVision ? 'cam-stage cam-nv' : 'cam-stage'} data-testid="cam-stage">
        {feed.live ? (
          <Canvas key={feed.id} feed={feed} visible={visible} />
        ) : (
          <div className="cam-card cam-static" data-testid="cam-offline">
            {feed.offlineReason ?? 'NO SIGNAL'}
          </div>
        )}
        <div className="cam-overlay" aria-hidden="true">
          <span className="cam-id">{`${floorName(feed.floor)} — ${feed.name}`.toUpperCase()}</span>
          <span className="cam-rec">REC ●</span>
          <span className="cam-stamp" data-testid="cam-timestamp">
            {stamp}
          </span>
        </div>
      </div>
    </div>
  );
};
