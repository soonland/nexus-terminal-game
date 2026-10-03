import { useState } from 'react';
import type { GameFile, GameState } from '../types/game';
import { fileReadKey } from '../types/game';
import { currentNode } from '../engine/state';
import { buildFileTree, listAccessibleFiles } from '../engine/fileTree';
import type { TreeEntry } from '../engine/fileTree';
import { fileBadges } from './explorerShared';
import type { Root, Selection } from './explorerShared';

interface Props {
  gameState: GameState;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onOpen: (root: Root, file: GameFile) => void;
  disabled: boolean;
}

export const FilesPane = ({ gameState, selection, onSelect, onOpen, disabled }: Props) => {
  // value overrides the default (top-level dirs open, deeper dirs closed)
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const node = currentNode(gameState);
  const authenticated = node.accessLevel !== 'none';
  const nodeFiles = listAccessibleFiles(node);
  const localFiles = gameState.player.exfiltrated;
  const readKeys = new Set(gameState.filesRead);

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
                onSelect({ root, path: entry.path });
              }}
              onDoubleClick={() => {
                onSelect({ root, path: entry.path });
                if (!disabled) onOpen(root, entry.file);
              }}>
              <span>{entry.name}</span>
              {fileBadges(entry.file).map(b => (
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

  return (
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
  );
};
