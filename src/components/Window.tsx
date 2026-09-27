import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { WindowInstance } from '../engine/windowManager';
import { MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT } from '../engine/windowManager';

interface Props {
  instance: WindowInstance;
  title: string;
  accentColor: string;
  closable: boolean;
  minimizable: boolean;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onMinimize: () => void;
  onClose: () => void;
  children: ReactNode;
}

interface DragOrigin {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface ResizeOrigin {
  startX: number;
  startY: number;
  originWidth: number;
  originHeight: number;
}

export const Window = ({
  instance,
  title,
  accentColor,
  closable,
  minimizable,
  onFocus,
  onMove,
  onResize,
  onMinimize,
  onClose,
  children,
}: Props) => {
  const dragOrigin = useRef<DragOrigin | null>(null);
  const resizeOrigin = useRef<ResizeOrigin | null>(null);

  const handleTitleBarPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragOrigin.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: instance.x,
        originY: instance.y,
      };
    },
    [instance.x, instance.y],
  );

  const handleResizeHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      resizeOrigin.current = {
        startX: e.clientX,
        startY: e.clientY,
        originWidth: instance.width,
        originHeight: instance.height,
      };
    },
    [instance.width, instance.height],
  );

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (dragOrigin.current) {
        const d = dragOrigin.current;
        onMove(d.originX + (e.clientX - d.startX), d.originY + (e.clientY - d.startY));
      }
      if (resizeOrigin.current) {
        const r = resizeOrigin.current;
        onResize(
          Math.max(MIN_WINDOW_WIDTH, r.originWidth + (e.clientX - r.startX)),
          Math.max(MIN_WINDOW_HEIGHT, r.originHeight + (e.clientY - r.startY)),
        );
      }
    };
    const handlePointerUp = () => {
      dragOrigin.current = null;
      resizeOrigin.current = null;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onMove, onResize]);

  return (
    <div
      className="window"
      style={{
        left: instance.x,
        top: instance.y,
        width: instance.width,
        height: instance.height,
        zIndex: instance.zIndex,
        borderTopColor: accentColor,
      }}
      onPointerDown={onFocus}>
      <div
        className="window-titlebar"
        data-testid="window-titlebar"
        onPointerDown={handleTitleBarPointerDown}>
        <span className="window-title">{title}</span>
        <span className="window-controls">
          {minimizable && (
            <button type="button" aria-label={`Minimize ${title}`} onClick={onMinimize}>
              &ndash;
            </button>
          )}
          {closable && (
            <button type="button" aria-label={`Close ${title}`} onClick={onClose}>
              &times;
            </button>
          )}
        </span>
      </div>
      <div
        className={
          instance.kind === 'terminal' ? 'window-body' : 'window-body window-body--secondary'
        }>
        {children}
      </div>
      <div
        className="window-resize-handle"
        data-testid="window-resize-handle"
        onPointerDown={handleResizeHandlePointerDown}
      />
    </div>
  );
};
