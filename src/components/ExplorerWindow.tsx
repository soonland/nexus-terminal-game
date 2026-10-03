import { useState } from 'react';
import type { GameFile, GameState } from '../types/game';
import { fileReadKey } from '../types/game';
import { currentNode } from '../engine/state';
import { buildFileTree, listAccessibleFiles } from '../engine/fileTree';
import type { TreeEntry } from '../engine/fileTree';

interface Props {
  gameState: GameState;
  onRunCommand: (cmd: string) => void;
  disabled: boolean;
}

type Root = 'node' | 'local';
interface Selection {
  root: Root;
  path: string;
}

const NO_CONTENT = '[content unavailable]';

const badges = (f: GameFile): string[] => [
  ...(f.tripwire ? ['[!]'] : []),
  ...(f.exfiltrable ? [] : ['[no-exfil]']),
  ...(f.locked ? ['[LOCKED]'] : []),
  ...(f.isTool ? ['[TOOL]'] : []),
];

export const ExplorerWindow = ({ gameState, onRunCommand, disabled }: Props) => {
  // value overrides the default (top-level dirs open, deeper dirs closed)
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<Selection | null>(null);

  const node = currentNode(gameState);
  const authenticated = node.accessLevel !== 'none';
  const nodeFiles = listAccessibleFiles(node);
  const localFiles = gameState.player.exfiltrated;
  const readKeys = new Set(gameState.filesRead);

  // Derived from live state, so a file the sentinel deletes (or a node change)
  // drops the selection instead of showing stale details.
  const selectedFile: GameFile | undefined = selection
    ? (selection.root === 'node' ? nodeFiles : localFiles).find(f => f.path === selection.path)
    : undefined;

  const open = (root: Root, file: GameFile) => {
    if (disabled) return;
    onRunCommand(root === 'local' ? `cat local:${file.path}` : `cat ${file.path}`);
  };

  const renderEntries = (root: Root, entries: TreeEntry[], depth: number) => (
    <ul className="explorer-list">
      {entries.map((entry, i) => {
        if (entry.kind === 'dir') {
          const key = `${root}:${entry.path}`;
          const isOpen = toggled[key] ?? depth === 0;
          return (
            <li key={`${key}#${String(i)}`}>
              <button
                type="button"
                className="explorer-row explorer-dir"
                aria-expanded={isOpen}
                onClick={() => {
                  setToggled(prev => ({ ...prev, [key]: !isOpen }));
                }}>
                <span className="explorer-twisty">{isOpen ? '▾' : '▸'}</span>
                <span>{entry.name}</span>
              </button>
              {isOpen && renderEntries(root, entry.children, depth + 1)}
            </li>
          );
        }
        const isSelected = selection?.root === root && selection.path === entry.path;
        const isRead = root === 'node' && readKeys.has(fileReadKey(node.id, entry.path));
        return (
          <li key={`${root}:${entry.path}#${String(i)}`}>
            <button
              type="button"
              className="explorer-row explorer-file"
              aria-pressed={isSelected}
              onClick={() => {
                setSelection({ root, path: entry.path });
              }}
              onDoubleClick={() => {
                setSelection({ root, path: entry.path });
                open(root, entry.file);
              }}>
              <span>{entry.name}</span>
              {badges(entry.file).map(b => (
                <span key={b} className="explorer-badge">
                  {b}
                </span>
              ))}
              {isRead && (
                <span className="explorer-read" aria-label="read">
                  ✓
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const renderDetail = (root: Root, file: GameFile) => {
    const isRead = root === 'local' || readKeys.has(fileReadKey(node.id, file.path));
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
              open(root, file);
            }}>
            Open
          </button>
          <button
            type="button"
            disabled={disabled || root === 'local' || !file.exfiltrable}
            onClick={() => {
              onRunCommand(`exfil ${file.path}`);
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

  return (
    <div className="explorer">
      <div className="explorer-tree">
        <div className="explorer-root">
          {node.label} ({node.ip})
        </div>
        {authenticated ? (
          nodeFiles.length > 0 ? (
            renderEntries('node', buildFileTree(nodeFiles), 0)
          ) : (
            <div className="explorer-empty">no accessible files</div>
          )
        ) : (
          <div className="explorer-empty">Permission denied — not authenticated</div>
        )}
        <div className="explorer-root">LOCAL</div>
        {localFiles.length > 0 ? (
          renderEntries('local', buildFileTree(localFiles), 0)
        ) : (
          <div className="explorer-empty">nothing exfiltrated yet</div>
        )}
      </div>
      {selection && selectedFile && renderDetail(selection.root, selectedFile)}
    </div>
  );
};
