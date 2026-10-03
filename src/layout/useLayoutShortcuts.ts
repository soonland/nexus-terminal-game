import { useEffect, useRef } from 'react';
import { PANE_IDS } from './layoutTree';
import type { PaneId } from './layoutTree';

export interface LayoutShortcutHandlers {
  onFocusPane: (pane: PaneId) => void;
  onToggleZoom: () => void;
  onCyclePreset: () => void;
  onEscape: () => void;
}

// Keys are matched on `code`, not `key`: on macOS Alt+digit/letter produces special
// characters in `key`, so only `code` identifies the physical key reliably.
export const useLayoutShortcuts = (enabled: boolean, handlers: LayoutShortcutHandlers): void => {
  const handlersRef = useRef(handlers);
  // Keep the latest handlers without re-subscribing the listener every render.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;

      if (e.altKey) {
        if (e.shiftKey) return;
        const digit = /^Digit([1-5])$/.exec(e.code);
        if (digit) {
          e.preventDefault();
          handlersRef.current.onFocusPane(PANE_IDS[Number(digit[1]) - 1]);
        } else if (e.code === 'KeyZ') {
          e.preventDefault();
          handlersRef.current.onToggleZoom();
        } else if (e.code === 'KeyP') {
          e.preventDefault();
          handlersRef.current.onCyclePreset();
        }
        return;
      }

      if (e.key === 'Escape') handlersRef.current.onEscape();
    };

    // Capture phase so a pane's own input cannot swallow the shortcut first.
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled]);
};
