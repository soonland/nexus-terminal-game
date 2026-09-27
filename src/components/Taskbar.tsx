import type { WindowKind, WindowManagerState } from '../engine/windowManager';
import { WINDOW_KINDS } from '../engine/windowManager';

interface Props {
  state: WindowManagerState;
  titles: Record<WindowKind, string>;
  onEntryClick: (kind: WindowKind) => void;
}

const entryState = (
  state: WindowManagerState,
  kind: WindowKind,
): 'focused' | 'open' | 'minimized' | 'closed' => {
  const instance = state[kind];
  if (!instance.open) return 'closed';
  if (instance.minimized) return 'minimized';
  const visible = WINDOW_KINDS.filter(k => state[k].open && !state[k].minimized);
  const maxZ = Math.max(...visible.map(k => state[k].zIndex));
  return instance.zIndex === maxZ ? 'focused' : 'open';
};

export const Taskbar = ({ state, titles, onEntryClick }: Props) => (
  <div className="taskbar">
    {WINDOW_KINDS.map(kind => (
      <button
        key={kind}
        type="button"
        className="taskbar-entry"
        data-state={entryState(state, kind)}
        onClick={() => {
          onEntryClick(kind);
        }}>
        {titles[kind]}
      </button>
    ))}
  </div>
);
