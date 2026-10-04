import { useRef } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import { PANE_IDS, computeGeometry } from './layoutTree';
import type { DividerSpec, LayoutState, PaneId, Rect, TreePath } from './layoutTree';

interface Props {
  state: LayoutState;
  panes: Record<PaneId, ReactNode>;
  headerExtras?: Partial<Record<PaneId, ReactNode>>;
  narrow: boolean;
  // Hides pane chrome (titles, borders) for the single-terminal view before a game exists.
  bare?: boolean;
  // Panes in alert re-skin themselves (data-alert), e.g. the comms pane during a Sentinel channel.
  alerts?: Partial<Record<PaneId, boolean>>;
  // Panes with traffic the player has not seen get a marker on their title (and narrow tab).
  unread?: Partial<Record<PaneId, boolean>>;
  onFocusPane: (pane: PaneId) => void;
  onRatio: (path: TreePath, ratio: number) => void;
}

const NUDGE = 0.02;

const pct = (n: number) => `${String(n * 100)}%`;

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

interface DividerProps {
  spec: DividerSpec;
  areaRef: RefObject<HTMLDivElement | null>;
  onRatio: (path: TreePath, ratio: number) => void;
}

const Divider = ({ spec, areaRef, onRatio }: DividerProps) => {
  const horizontal = spec.dir === 'row'; // a row split puts a vertical bar between columns
  const { parent, ratio } = spec;

  const style = horizontal
    ? {
        left: `calc(${pct(parent.x + parent.w * ratio)} - 2px)`,
        top: pct(parent.y),
        width: '4px',
        height: pct(parent.h),
      }
    : {
        left: pct(parent.x),
        top: `calc(${pct(parent.y + parent.h * ratio)} - 2px)`,
        width: pct(parent.w),
        height: '4px',
      };

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const move = (ev: globalThis.PointerEvent) => {
      const area = areaRef.current?.getBoundingClientRect();
      if (!area || area.width <= 0 || area.height <= 0) return;
      // Map the pointer into the parent split's own rectangle (a fraction of the area).
      const px = (ev.clientX - area.left) / area.width;
      const py = (ev.clientY - area.top) / area.height;
      onRatio(spec.path, horizontal ? (px - parent.x) / parent.w : (py - parent.y) / parent.h);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const lower = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const raise = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (e.key === lower) onRatio(spec.path, ratio - NUDGE);
    else if (e.key === raise) onRatio(spec.path, ratio + NUDGE);
    else return;
    e.preventDefault();
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={15}
      aria-valuemax={85}
      data-path={spec.path.join('')}
      className={`divider divider-${horizontal ? 'v' : 'h'}`}
      style={style}
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
    />
  );
};

export const LayoutRoot = ({
  state,
  panes,
  headerExtras,
  narrow,
  bare = false,
  alerts,
  unread,
  onFocusPane,
  onRatio,
}: Props) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const solo = narrow || state.zoomed !== null;
  const soloPane = state.zoomed ?? state.focused;
  const geometry = computeGeometry(state.trees[state.preset]);

  return (
    <div className={bare ? 'layout layout-bare' : 'layout'}>
      {narrow && (
        <div role="tablist" className="pane-tabs">
          {PANE_IDS.map((id, i) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === soloPane}
              className="pane-tab"
              onClick={() => {
                onFocusPane(id);
              }}>
              {`${String(i + 1)}:${id}${unread?.[id] === true ? ' ●' : ''}`}
            </button>
          ))}
        </div>
      )}
      <div className="layout-area" ref={areaRef}>
        {/* Panes are always rendered in the same order with stable keys, so a layout
            change only restyles them — nothing re-mounts and the terminal keeps its
            input history and scroll position. */}
        {PANE_IDS.map((id, i) => {
          const isVisible = !solo || id === soloPane;
          const rect = solo ? FULL : geometry.panes[id];
          return (
            <section
              key={id}
              className="pane"
              data-pane={id}
              data-focused={id === state.focused}
              data-alert={alerts?.[id] === true}
              data-unread={unread?.[id] === true}
              style={{
                display: isVisible ? 'flex' : 'none',
                left: pct(rect.x),
                top: pct(rect.y),
                width: pct(rect.w),
                height: pct(rect.h),
              }}
              onPointerDown={() => {
                onFocusPane(id);
              }}>
              <header className="pane-title">
                <span>{`${String(i + 1)}:${id}`}</span>
                {unread?.[id] === true && (
                  <span className="pane-unread" title="unread">
                    ●
                  </span>
                )}
                {headerExtras?.[id]}
              </header>
              <div className="pane-body">{panes[id]}</div>
            </section>
          );
        })}
        {!solo &&
          geometry.dividers.map(spec => (
            <Divider
              key={spec.path.join('') || 'root'}
              spec={spec}
              areaRef={areaRef}
              onRatio={onRatio}
            />
          ))}
      </div>
    </div>
  );
};
