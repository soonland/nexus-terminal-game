import { PANE_IDS } from './layoutTree';
import type { PaneId, PresetId } from './layoutTree';
import { getTraceLevel } from '../types/terminal';

interface Props {
  preset: PresetId;
  focused: PaneId;
  zoomed: PaneId | null;
  nodeIp: string;
  trace: number;
  unread: PaneId[];
}

export const StatusBar = ({ preset, focused, zoomed, nodeIp, trace, unread }: Props) => (
  <footer className="statusbar">
    <span className="statusbar-preset">[{preset}]</span>
    <span className="statusbar-panes">
      {PANE_IDS.map((id, i) => {
        const marker = id === focused ? '*' : '';
        const zoom = id === zoomed ? 'Z' : '';
        const bang = unread.includes(id) ? '!' : '';
        return (
          <span key={id} className="statusbar-pane" data-focused={id === focused}>
            {`${String(i + 1)}:${id}${marker}${zoom}${bang}`}
          </span>
        );
      })}
    </span>
    <span className="statusbar-right">
      <span>{nodeIp}</span>
      <span style={{ color: getTraceLevel(trace).color }}>{`TRC ${String(trace)}%`}</span>
    </span>
  </footer>
);
