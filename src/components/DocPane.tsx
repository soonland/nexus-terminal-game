import type { GameState } from '../types/game';
import { fileReadKey } from '../types/game';
import { currentNode } from '../engine/state';
import { NO_CONTENT, catCommand, exfilCommand, resolveSelection } from './explorerShared';
import type { Selection } from './explorerShared';

interface Props {
  gameState: GameState;
  selection: Selection | null;
  onRunCommand: (cmd: string) => void;
  disabled: boolean;
}

export const DocPane = ({ gameState, selection, onRunCommand, disabled }: Props) => {
  const resolved = resolveSelection(gameState, selection);
  if (!resolved) {
    return <div className="explorer-placeholder">Select a file in the files pane</div>;
  }

  const { root, file } = resolved;
  const nodeId = currentNode(gameState).id;
  const isRead = root === 'local' || gameState.filesRead.includes(fileReadKey(nodeId, file.path));
  const body = isRead ? (file.content ?? (root === 'local' ? NO_CONTENT : null)) : null;

  return (
    <div className="explorer-detail">
      <div className="explorer-detail-name">{file.name}</div>
      <div>{file.path}</div>
      <div>
        type: {file.type} · requires: {file.accessRequired}
      </div>
      {file.tripwire && (
        <div className="explorer-warn">[!] reading this file triggers up to +25 trace</div>
      )}
      {!file.exfiltrable && <div>[no-exfil] file is locked to this node</div>}
      {file.locked && <div>[LOCKED] cat will be denied — run unlock {file.name}</div>}
      {file.isTool && <div>[TOOL] exfil this file to add a tool to your inventory</div>}
      <div className="explorer-actions">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onRunCommand(catCommand(root, file));
          }}>
          Open
        </button>
        <button
          type="button"
          disabled={disabled || root === 'local' || !file.exfiltrable}
          onClick={() => {
            onRunCommand(exfilCommand(file));
          }}>
          Exfil
        </button>
      </div>
      {body !== null ? (
        <pre className="explorer-viewer">{body}</pre>
      ) : (
        <div className="explorer-placeholder">Not read yet — Open to read (may cost trace)</div>
      )}
    </div>
  );
};
