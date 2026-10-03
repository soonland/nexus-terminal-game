import type { Tool } from '../types/game';
import type { SaveState } from './persistence';

// Paths and the key tool were renamed by the naming audit. Saves written earlier keep
// old paths; without this their exfiltrated files, cached contents, locks and planted
// hints would silently fail to match the renamed files.
const LEGACY_PATHS: Record<string, string> = {
  '/root/.aria/aria_key.bin': '/root/.cassandra/subnet_key.bin',
  '/legal/aria/ARIA_BOARD_DISCLOSURE': '/legal/cassandra/CASSANDRA_BOARD_DISCLOSURE',
  '/legal/aria/aria_nda_template.docx': '/legal/cassandra/cassandra_nda_template.docx',
  '/root/project_aria_summary.txt': '/root/project_cassandra_summary.txt',
};

const HINT_PATH = /^\/tmp\/\.aria_hint_(\d+)\.txt$/;
const HINT_NAME = /^\.aria_hint_(\d+)\.txt$/;

const migratePath = (path: string): string =>
  LEGACY_PATHS[path] ?? path.replace(HINT_PATH, '/tmp/.hint_$1.txt');

// filesRead entries are fileReadKey(nodeId, path) = `${nodeId}:${path}` — rewrite the path part.
const migrateReadKey = (key: string): string => {
  const sep = key.indexOf(':');
  if (sep < 0) return key;
  return `${key.slice(0, sep + 1)}${migratePath(key.slice(sep + 1))}`;
};

const migrateName = (name: string): string => name.replace(HINT_NAME, '.hint_$1.txt');

const KEY_TOOL: Tool = {
  id: 'subnet-key',
  name: 'Restricted Subnet Key',
  description: 'Authentication token granting access to the restricted subnetwork (172.16.0.0/16).',
};

export const migrateSavePaths = (save: SaveState): SaveState => {
  const nodes = Object.fromEntries(
    Object.entries(save.network.nodes).map(([id, delta]) => {
      const next = { ...delta };
      next.cachedFileContents = Object.fromEntries(
        Object.entries(delta.cachedFileContents).map(([p, c]) => [migratePath(p), c]),
      );
      if (delta.lockedFilePaths) next.lockedFilePaths = delta.lockedFilePaths.map(migratePath);
      if (delta.deletedFilePaths) next.deletedFilePaths = delta.deletedFilePaths.map(migratePath);
      if (delta.plantedFiles) {
        next.plantedFiles = delta.plantedFiles.map(f => ({
          ...f,
          path: migratePath(f.path),
          name: migrateName(f.name),
        }));
      }
      return [id, next];
    }),
  );

  return {
    ...save,
    ...(save.filesRead ? { filesRead: save.filesRead.map(migrateReadKey) } : {}),
    player: {
      ...save.player,
      exfiltratedPaths: save.player.exfiltratedPaths.map(migratePath),
      tools: save.player.tools.map(t => {
        // Old saves carry the pre-audit id, which is no longer part of ToolId.
        const savedId: string = t.id;
        return savedId === 'aria-key' ? { ...t, ...KEY_TOOL } : t;
      }),
    },
    network: { ...save.network, nodes },
  };
};
