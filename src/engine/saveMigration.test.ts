import { describe, it, expect } from 'vitest';
import { migrateSavePaths } from './saveMigration';

const base = (over: Record<string, unknown> = {}) =>
  ({
    version: 6,
    player: { exfiltratedPaths: [], tools: [] },
    network: { nodes: {}, sentinelNodes: [] },
    ...over,
  }) as never;

describe('migrateSavePaths', () => {
  it('renames legacy exfiltrated paths', () => {
    const save = base({
      player: {
        exfiltratedPaths: ['/root/.aria/aria_key.bin', '/legal/aria/ARIA_BOARD_DISCLOSURE', '/x/y'],
        tools: [],
      },
    });
    const out = migrateSavePaths(save) as unknown as { player: { exfiltratedPaths: string[] } };
    expect(out.player.exfiltratedPaths).toEqual([
      '/root/.cassandra/subnet_key.bin',
      '/legal/cassandra/CASSANDRA_BOARD_DISCLOSURE',
      '/x/y',
    ]);
  });

  it('renames legacy paths in per-node deltas (cached contents, locks, deletions)', () => {
    const save = base({
      network: {
        sentinelNodes: [],
        nodes: {
          exec_legal: {
            cachedFileContents: { '/legal/aria/aria_nda_template.docx': 'x', '/keep': 'y' },
            lockedFilePaths: ['/legal/aria/ARIA_BOARD_DISCLOSURE'],
            deletedFilePaths: ['/root/project_aria_summary.txt'],
          },
        },
      },
    });
    const out = migrateSavePaths(save) as unknown as {
      network: {
        nodes: Record<
          string,
          {
            cachedFileContents: Record<string, string>;
            lockedFilePaths: string[];
            deletedFilePaths: string[];
          }
        >;
      };
    };
    const d = out.network.nodes['exec_legal'];
    expect(Object.keys(d.cachedFileContents).sort()).toEqual([
      '/keep',
      '/legal/cassandra/cassandra_nda_template.docx',
    ]);
    expect(d.lockedFilePaths).toEqual(['/legal/cassandra/CASSANDRA_BOARD_DISCLOSURE']);
    expect(d.deletedFilePaths).toEqual(['/root/project_cassandra_summary.txt']);
  });

  it('renames planted mutation hint files and the key tool', () => {
    const save = base({
      player: {
        exfiltratedPaths: [],
        tools: [
          {
            id: 'aria-key',
            name: 'Aria Key',
            description:
              'Authentication token granting access to the Aria subnetwork (172.16.0.0/16).',
          },
          { id: 'log-wiper', name: 'Log Wiper', description: 'x' },
        ],
      },
      network: {
        sentinelNodes: [],
        nodes: {
          ops_hr_db: {
            cachedFileContents: {},
            plantedFiles: [
              { name: '.aria_hint_7.txt', path: '/tmp/.aria_hint_7.txt', content: 'x' },
            ],
          },
        },
      },
    });
    const out = migrateSavePaths(save) as unknown as {
      player: { tools: { id: string; name: string; description: string }[] };
      network: { nodes: Record<string, { plantedFiles: { name: string; path: string }[] }> };
    };
    expect(out.player.tools[0]).toEqual({
      id: 'subnet-key',
      name: 'Restricted Subnet Key',
      description:
        'Authentication token granting access to the restricted subnetwork (172.16.0.0/16).',
    });
    expect(out.player.tools[1].id).toBe('log-wiper');
    expect(out.network.nodes['ops_hr_db'].plantedFiles[0]).toMatchObject({
      name: '.hint_7.txt',
      path: '/tmp/.hint_7.txt',
    });
  });

  it('leaves a current save untouched', () => {
    const save = base({
      player: {
        exfiltratedPaths: ['/root/.cassandra/subnet_key.bin'],
        tools: [{ id: 'subnet-key', name: 'Restricted Subnet Key', description: 'd' }],
      },
    });
    expect(migrateSavePaths(save)).toEqual(save);
  });
});
