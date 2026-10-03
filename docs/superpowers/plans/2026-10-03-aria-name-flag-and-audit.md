# ARIA_NAME_KNOWN Flag and Naming Audit (#211, #212) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `ARIA_NAME_KNOWN` flag and its triggers (#211), then make every pre-reveal player-visible string use the cover name **CASSANDRA** (#212), so the player never sees "Aria" until they learn it through Sentinel's lore.

**Architecture:** A tiny `ariaName` module owns the flag, the trigger path constant and the helpers. The flag flips when the board vote is read (`cat` or `cat local:`) or when the player first connects to a layer-5 node. The audit rewrites authored data in place (renaming a few files, paths, services and the key tool id), gates the few UI strings that depend on the flag (help, dossier heading, `msg` usage), and adds guard tests that fail if "aria" reappears in pre-reveal text. A save-migration step keeps existing saves working across the renames.

**Tech Stack:** TypeScript, Vitest (+ Testing Library for components), React.

**Spec / issues:** `docs/story-bible.md` §1b and §9; GitHub issues #211 and #212.

## Global Constraints

- **Cover name:** CASSANDRA (uppercase in headings/codes, "Cassandra" in prose). Internal code identifiers (`aria_core`, `ariaPlanted`, `state.aria`, `ariaInfluence`, node ids `aria_*`) stay unchanged: only player-visible text changes.
- **The single allowed pre-reveal bridge:** `PROJ_SENTINEL_BOARD_VOTE.pdf` (path `/home/cfo/documents/PROJ_SENTINEL_BOARD_VOTE.pdf`) is the only authored text outside layer 5 that may contain "ARIA".
- **`SAVE_VERSION` stays 6.** Renamed paths and the renamed tool id are migrated on load (Task 2), not by discarding saves.
- **The name is never revealed by exfiltrating the key** (only by the vote read or a layer-5 connect).
- No player-visible change to layer-5 *content* (descriptions, files) beyond the label and service renames below: layer-5 content is only seen after connecting, when the flag is already set.
- Style: arrow functions only, semicolons, single quotes, trailing commas, 100-col; `eslint --fix` runs on commit and strips casts it judges unnecessary, so prefer generics over `as` in tests; run `pnpm tsc -b` before committing; `react-hooks/refs` forbids assigning refs in render.
- Pre-commit checks, in order, before every commit: `pnpm format`, `pnpm tsc -b`, `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip`. Per-file coverage must stay ≥ 75%.
- Commit messages: Conventional Commits, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

### Rename table (single source of truth)

| Surface | Old | New |
| --- | --- | --- |
| Key file name / path | `aria_key.bin` / `/root/.aria/aria_key.bin` | `subnet_key.bin` / `/root/.cassandra/subnet_key.bin` |
| Key tool id / name | `aria-key` / `Aria Key` | `subnet-key` / `Restricted Subnet Key` |
| Key tool description | `Authentication token granting access to the Aria subnetwork (172.16.0.0/16).` | `Authentication token granting access to the restricted subnetwork (172.16.0.0/16).` |
| Key exfil banner | `// ARIA KEY ACQUIRED` … `// Tool added: aria-key` | `// RESTRICTED SUBNET KEY ACQUIRED` … `// Tool added: Restricted Subnet Key` |
| Disclosure file | `ARIA_BOARD_DISCLOSURE` / `/legal/aria/ARIA_BOARD_DISCLOSURE` | `CASSANDRA_BOARD_DISCLOSURE` / `/legal/cassandra/CASSANDRA_BOARD_DISCLOSURE` |
| NDA file | `aria_nda_template.docx` / `/legal/aria/aria_nda_template.docx` | `cassandra_nda_template.docx` / `/legal/cassandra/cassandra_nda_template.docx` |
| CEO summary | `project_aria_summary.txt` / `/root/project_aria_summary.txt` | `project_cassandra_summary.txt` / `/root/project_cassandra_summary.txt` |
| Services | `aria-socket` (exec_ceo), `aria-protocol` (layer 5) | `cassandra-socket`, `cassandra-protocol` |
| Layer-5 labels | `ARIA SURVEILLANCE` / `BEHAVIOURAL` / `PERSONNEL` / `CORE` / `DECISION` | `CASSANDRA …` (same suffixes) |
| Map layer label | `ARIA` | `CASSANDRA` |
| Mutation hint file | `/tmp/.aria_hint_N.txt` | `/tmp/.hint_N.txt` |
| Mutation modify tag | `// [ARIA] Intelligence updated…` | `// [CASSANDRA] …` until the flag is set, `// [ARIA] …` after |
| Employee names | `Aria` in `FIRST_NAMES` | removed |

## Review Focus

- The name must not appear pre-reveal on **any** surface: `ls`, `cat`, `scan`, `status`, `whoami`, `inventory`, key exfil output, the map and notes, the explorer tree and viewer, help, the dossier heading, `msg` usage, mutation-planted hint files. (Tasks 2–3 guard tests)
- The flag flips only on a **successful** read of the vote (`cat`, and `cat local:` of an exfiltrated copy) or on a layer-5 connect; never on a denied, locked or fallback read, an exfil of the vote, or the key exfil. (Task 1)
- Renames must not break the disclosure fork gate, key detection or `exploit cassandra-socket`; and **existing saves** with old paths, a `aria-key` tool or `.aria_hint_*` planted files must load and keep their exfiltrated files. (Task 2)
- After the flag is set the name is allowed again where designed (help shows `msg aria`, dossier heading, `[ARIA]` mutation tag). (Task 3)
- `msg aria` still works as a hidden command pre-reveal; its usage text must not leak when the player has not typed it. (Task 3)

## File Structure

- **Create** `src/engine/ariaName.ts` (+ `src/engine/ariaName.test.ts`).
- **Create** `src/data/__tests__/ariaNameLeak.test.ts` (data guard) and `src/engine/__tests__/ariaNameWalk.test.ts` (engine-output guard).
- **Create** `src/engine/saveMigration.ts` (+ test) — legacy path / tool-id migration.
- **Modify** `src/data/anchorNodes.ts`, `src/data/contracts.ts`, `src/data/employeeData.ts`, `src/types/game.ts` (`ToolId`), `src/engine/commands.ts`, `src/engine/ariaMutations.ts`, `src/engine/persistence.ts`, `src/components/HelpModal.tsx`, `src/components/DossierWindow.tsx`, `src/components/MapModal.tsx`, `src/App.tsx`, `CLAUDE.md`.
- **Update** existing tests that reference old names/paths: `src/engine/commands.test.ts`, `src/engine/__tests__/commands.forks.test.ts`, `src/engine/__tests__/ariaMutations.test.ts`, `src/data/contracts.test.ts`, `src/engine/completabilityGuard.test.ts` (comment only).

---

### Task 1 (#211): The flag, its helper and its triggers

**Files:**
- Create: `src/engine/ariaName.ts`, `src/engine/ariaName.test.ts`
- Modify: `src/engine/commands.ts` (`cmdCat` successful-read path, `cat local:` branch, `cmdConnect`)
- Test: `src/engine/ariaName.test.ts`, `src/engine/commands.test.ts`, `src/engine/persistence.test.ts`

**Interfaces:**
- Produces: `ARIA_NAME_FLAG = 'ARIA_NAME_KNOWN'`, `SENTINEL_VOTE_PATH = '/home/cfo/documents/PROJ_SENTINEL_BOARD_VOTE.pdf'`, `isAriaNameKnown(state: GameState): boolean`, `markAriaNameKnown(state: GameState): GameState` (pure, idempotent, returns the same object if already set).

- [ ] **Step 1: Write the failing tests**

`src/engine/ariaName.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ARIA_NAME_FLAG,
  SENTINEL_VOTE_PATH,
  isAriaNameKnown,
  markAriaNameKnown,
} from './ariaName';
import { createInitialState } from './state';
import { buildNodeMap } from '../data/anchorNodes';

describe('ariaName', () => {
  it('uses the agreed flag name', () => {
    expect(ARIA_NAME_FLAG).toBe('ARIA_NAME_KNOWN');
  });

  it('is unknown on a fresh game', () => {
    expect(isAriaNameKnown(createInitialState())).toBe(false);
  });

  it('marks the name known without mutating the input', () => {
    const state = createInitialState();
    const next = markAriaNameKnown(state);
    expect(isAriaNameKnown(next)).toBe(true);
    expect(isAriaNameKnown(state)).toBe(false);
  });

  it('is idempotent and returns the same object once set', () => {
    const once = markAriaNameKnown(createInitialState());
    expect(markAriaNameKnown(once)).toBe(once);
  });

  it('points at the real board vote file', () => {
    const files = Object.values(buildNodeMap()).flatMap(n => n.files);
    expect(files.some(f => f.path === SENTINEL_VOTE_PATH)).toBe(true);
  });
});
```

Append to `src/engine/commands.test.ts` (add `import { isAriaNameKnown, SENTINEL_VOTE_PATH } from './ariaName';`):

```ts
describe('ARIA_NAME_KNOWN triggers', () => {
  const atCfo = (over: (s: GameState) => void = () => undefined): GameState =>
    produce(createInitialState(), s => {
      s.network.currentNodeId = 'exec_cfo';
      s.network.nodes['exec_cfo']!.accessLevel = 'admin';
      over(s);
    });

  it('is set by reading the board vote', async () => {
    const result = await resolveCommand(`cat ${SENTINEL_VOTE_PATH}`, atCfo());
    expect(isAriaNameKnown(result.nextState as GameState)).toBe(true);
  });

  it('is set by reading an exfiltrated copy of the board vote', async () => {
    const base = atCfo();
    const vote = base.network.nodes['exec_cfo']!.files.find(f => f.path === SENTINEL_VOTE_PATH)!;
    const state = produce(base, s => {
      s.player.exfiltrated = [{ ...vote }];
    });
    const result = await resolveCommand(`cat local:${SENTINEL_VOTE_PATH}`, state);
    expect(isAriaNameKnown((result.nextState ?? state) as GameState)).toBe(true);
  });

  it('is not set by a denied, locked or exfil-only touch of the vote', async () => {
    const denied = atCfo(s => {
      s.network.nodes['exec_cfo']!.accessLevel = 'none';
    });
    expect(
      isAriaNameKnown(((await resolveCommand(`cat ${SENTINEL_VOTE_PATH}`, denied)).nextState ?? denied) as GameState),
    ).toBe(false);

    const locked = atCfo(s => {
      s.network.nodes['exec_cfo']!.files.find(f => f.path === SENTINEL_VOTE_PATH)!.locked = true;
    });
    expect(
      isAriaNameKnown(((await resolveCommand(`cat ${SENTINEL_VOTE_PATH}`, locked)).nextState ?? locked) as GameState),
    ).toBe(false);

    const exfil = await resolveCommand(`exfil ${SENTINEL_VOTE_PATH}`, atCfo());
    expect(isAriaNameKnown((exfil.nextState ?? atCfo()) as GameState)).toBe(false);
  });

  it('is not set by a read that fell back to the offline placeholder', async () => {
    const state = atCfo(s => {
      s.network.nodes['exec_cfo']!.files.find(f => f.path === SENTINEL_VOTE_PATH)!.content = null;
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    try {
      const result = await resolveCommand(`cat ${SENTINEL_VOTE_PATH}`, state);
      expect(isAriaNameKnown((result.nextState ?? state) as GameState)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('is not set by exfiltrating the restricted subnet key', async () => {
    const state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'exec_ceo';
      s.network.nodes['exec_ceo']!.accessLevel = 'admin';
    });
    const result = await resolveCommand('exfil aria_key.bin', state); // renamed to subnet_key.bin in Task 2
    expect((result.nextState as GameState).player.tools.length).toBeGreaterThan(0);
    expect(isAriaNameKnown(result.nextState as GameState)).toBe(false);
  });

  it('is set by the first connect to a layer-5 node', async () => {
    const state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'exec_ceo';
      s.network.nodes['exec_ceo']!.compromised = true;
      s.network.nodes['exec_ceo']!.connections.push('aria_surveillance');
      s.network.nodes['aria_surveillance']!.discovered = true;
    });
    const result = await resolveCommand('connect 172.16.0.1', state);
    expect((result.nextState as GameState).network.currentNodeId).toBe('aria_surveillance');
    expect(isAriaNameKnown(result.nextState as GameState)).toBe(true);
  });

  it('is not set by connecting to a node below layer 5', async () => {
    const state = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.compromised = true;
      s.network.nodes['vpn_gateway']!.discovered = true;
    });
    const result = await resolveCommand('connect 10.0.0.2', state);
    expect(isAriaNameKnown((result.nextState ?? state) as GameState)).toBe(false);
  });
});
```

(The key-exfil test deliberately uses the file's current name `aria_key.bin`; Task 2 renames it to `subnet_key.bin` together with the other renamed-name tests.)

Append to `src/engine/persistence.test.ts` (inside the `filesRead persistence` style block, using its `mockStorage`):

```ts
describe('ARIA_NAME_KNOWN persistence', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;
  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('survives a save and reload', () => {
    saveGame(produce(createInitialState(), s => {
      s.flags['ARIA_NAME_KNOWN'] = true;
    }));
    expect(loadGame()?.flags['ARIA_NAME_KNOWN']).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/engine/ariaName.test.ts src/engine/commands.test.ts src/engine/persistence.test.ts`
Expected: FAIL — `./ariaName` not found; trigger tests fail.

- [ ] **Step 3: Implement**

`src/engine/ariaName.ts`:

```ts
import type { GameState } from '../types/game';

// The player never sees the name "Aria" until this flag is set. It flips when the board
// vote is read (Sentinel's lineage) or, as a fallback, on the first layer-5 connect.
export const ARIA_NAME_FLAG = 'ARIA_NAME_KNOWN';

// The single authored document outside layer 5 allowed to bridge CASSANDRA and ARIA.
export const SENTINEL_VOTE_PATH = '/home/cfo/documents/PROJ_SENTINEL_BOARD_VOTE.pdf';

export const isAriaNameKnown = (state: GameState): boolean => state.flags[ARIA_NAME_FLAG] === true;

export const markAriaNameKnown = (state: GameState): GameState =>
  isAriaNameKnown(state) ? state : { ...state, flags: { ...state.flags, [ARIA_NAME_FLAG]: true } };
```

`src/engine/commands.ts`:
- Import `{ SENTINEL_VOTE_PATH, markAriaNameKnown } from './ariaName'`.
- In `cmdCat`, in the block added for `filesRead` (right after `if (content !== FILE_CONTENT_FALLBACK) { … }`), mark the flag for the vote:

```ts
  // Reading the board vote is how the player learns Sentinel's parent has a name.
  if (content !== FILE_CONTENT_FALLBACK && file.path === SENTINEL_VOTE_PATH) {
    next = markAriaNameKnown(next);
  }
```

- In the `cat local:` branch of `cmdCat`, after `const content = cached.content ?? FILE_CONTENT_FALLBACK;` return a `nextState` when the cached file is the vote and was readable:

```ts
    const lines: Out = [sep()];
    content.split('\n').forEach(l => lines.push(out(l)));
    lines.push(sep());
    if (cached.path === SENTINEL_VOTE_PATH && cached.content !== null) {
      return { lines, nextState: markAriaNameKnown(state) };
    }
    return { lines };
```

- In `cmdConnect`, inside the `produce(state, s => { … })` that sets `currentNodeId`, add: `if (target.layer === 5) s.flags[ARIA_NAME_FLAG] = true;` (import `ARIA_NAME_FLAG` too) — or wrap the produced state: after `let next = produce(…)`, add `if (target.layer === 5) next = markAriaNameKnown(next);`. Use the latter.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/engine/ariaName.test.ts src/engine/commands.test.ts src/engine/persistence.test.ts && pnpm tsc -b`
Expected: PASS (the key-exfil test uses `aria_key.bin` at this stage).

- [ ] **Step 5: Commit**

```bash
git add src/engine/ariaName.ts src/engine/ariaName.test.ts src/engine/commands.ts src/engine/commands.test.ts src/engine/persistence.test.ts
git commit -m "feat: add ARIA_NAME_KNOWN flag with vote-read and layer-5 triggers (#211)"
```

---

### Task 2 (#212, part 1): Rewrite authored data and migrate saves

**Files:**
- Modify: `src/data/anchorNodes.ts`, `src/data/contracts.ts`, `src/types/game.ts` (`ToolId`), `src/engine/commands.ts` (paths, tool, banner), `src/engine/ariaMutations.ts`, `src/engine/persistence.ts`
- Create: `src/engine/saveMigration.ts`, `src/engine/saveMigration.test.ts`, `src/data/__tests__/ariaNameLeak.test.ts`
- Update tests: `src/engine/commands.test.ts`, `src/engine/__tests__/commands.forks.test.ts`, `src/engine/__tests__/ariaMutations.test.ts`, `src/data/contracts.test.ts`

**Interfaces:**
- Consumes: Task 1 (`SENTINEL_VOTE_PATH`).
- Produces: `migrateSavePaths(save: SaveState): SaveState` in `src/engine/saveMigration.ts` (export `SaveState` from `persistence.ts` as a type if needed); the renamed constants from the rename table.

- [ ] **Step 1: Write the failing guard test and migration test**

`src/data/__tests__/ariaNameLeak.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ANCHOR_CREDENTIALS, buildNodeMap } from '../anchorNodes';
import { SENTINEL_VOTE_PATH } from '../../engine/ariaName';
import { FIRST_NAMES } from '../employeeData';

const ARIA = /aria/i;

describe('pre-reveal data never contains the name Aria', () => {
  it('has no leak in labels, services, credentials or layer 0–4 text', () => {
    const leaks: string[] = [];
    const check = (where: string, text: string | null | undefined) => {
      if (text && ARIA.test(text)) leaks.push(`${where}: ${text.slice(0, 60)}`);
    };

    for (const node of Object.values(buildNodeMap())) {
      // Visible before connecting (scan, map, notes, explorer root) at every layer.
      check(`${node.id} label`, node.label);
      node.services.forEach(s => {
        check(`${node.id} service`, s.name);
      });
      // Layer 5 content is only seen after connecting, when the flag is already set.
      if (node.layer === 5) continue;
      check(`${node.id} description`, node.description);
      check(`${node.id} flavour`, node.flavourDescription);
      for (const f of node.files) {
        check(`${node.id} file name`, f.name);
        check(`${node.id} file path`, f.path);
        // The board vote is the one allowed bridge between CASSANDRA and ARIA.
        if (f.path !== SENTINEL_VOTE_PATH) check(`${node.id} ${f.name} content`, f.content);
      }
    }
    for (const c of ANCHOR_CREDENTIALS) check(`credential ${c.id} source`, c.source);

    expect(leaks).toEqual([]);
  });

  it('the board vote bridges both names', () => {
    const vote = Object.values(buildNodeMap())
      .flatMap(n => n.files)
      .find(f => f.path === SENTINEL_VOTE_PATH);
    expect(vote?.content).toMatch(/ARIA/);
    expect(vote?.content).toMatch(/Project CASSANDRA/);
    expect(vote?.content).toMatch(/next-generation/i);
  });

  it('the employee name pool cannot produce a filler employee called Aria', () => {
    expect(FIRST_NAMES.some(n => n.toLowerCase() === 'aria')).toBe(false);
  });
});
```

`src/engine/saveMigration.test.ts`:

```ts
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
      network: { nodes: Record<string, { cachedFileContents: Record<string, string>; lockedFilePaths: string[]; deletedFilePaths: string[] }> };
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
          { id: 'aria-key', name: 'Aria Key', description: 'Authentication token granting access to the Aria subnetwork (172.16.0.0/16).' },
          { id: 'log-wiper', name: 'Log Wiper', description: 'x' },
        ],
      },
      network: {
        sentinelNodes: [],
        nodes: {
          ops_hr_db: {
            plantedFiles: [{ name: '.aria_hint_7.txt', path: '/tmp/.aria_hint_7.txt', content: 'x' }],
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
      description: 'Authentication token granting access to the restricted subnetwork (172.16.0.0/16).',
    });
    expect(out.player.tools[1].id).toBe('log-wiper');
    expect(out.network.nodes['ops_hr_db'].plantedFiles[0]).toMatchObject({
      name: '.hint_7.txt',
      path: '/tmp/.hint_7.txt',
    });
  });

  it('leaves a current save untouched', () => {
    const save = base({
      player: { exfiltratedPaths: ['/root/.cassandra/subnet_key.bin'], tools: [{ id: 'subnet-key', name: 'Restricted Subnet Key', description: 'd' }] },
    });
    expect(migrateSavePaths(save)).toEqual(save);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/data/__tests__/ariaNameLeak.test.ts src/engine/saveMigration.test.ts`
Expected: FAIL — leak test lists the known leaks; migration module not found.

- [ ] **Step 3: Rewrite the authored data**

Run this script from the repo root (it asserts every replacement matched the expected number of times):

```python
import re
p = 'src/data/anchorNodes.ts'
s = open(p).read()

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (old, n, count)
    s = s.replace(old, new)

rep("CEO root access. Password set by Aria.", "CEO root access. Password set by CASSANDRA.")
rep("# TEMP: ALLOW aria_subnet <- exec_subnet", "# TEMP: ALLOW cassandra_subnet <- exec_subnet")
rep("ALLOW 10.5.0.0/24 (aria) unconditionally", "ALLOW 10.5.0.0/24 (cassandra) unconditionally")
rep("PROJ-ARIA-INFRA", "PROJ-CASSANDRA-INFRA", 5)
rep("Bonus structure tied to PROJ-ARIA milestone completion.", "Bonus structure tied to PROJ-CASSANDRA milestone completion.")
rep("Aria project is 14 months ahead of schedule.", "Cassandra project is 14 months ahead of schedule.")
rep("Password last set by Aria directly", "Password last set by Cassandra directly")
rep("Agenda item 4: Project ARIA status.", "Agenda item 4: Project CASSANDRA status.")
rep('CEO response: "Aria operates within defined parameters."', 'CEO response: "Cassandra operates within defined parameters."')
rep("Scope: derivation of the ARIA behavioural engine for security enforcement applications.",
    "Scope: derivation of the ARIA behavioural engine (Project CASSANDRA) as a next-generation enforcement platform for security applications.")
rep("A folder labelled ARIA_BOARD_DISCLOSURE has never been opened.", "A folder labelled CASSANDRA_BOARD_DISCLOSURE has never been opened.")
rep("aria_nda_template.docx", "cassandra_nda_template.docx", 2)
rep("/legal/aria/", "/legal/cassandra/", 2)
rep("related to Project ARIA.", "related to Project CASSANDRA.")
rep("Project ARIA involves artificial general intelligence", "Project CASSANDRA involves artificial general intelligence")
rep("ARIA_BOARD_DISCLOSURE", "CASSANDRA_BOARD_DISCLOSURE", 3)  # short description + file name + path (flavour already rewritten above)
rep("Full Disclosure: Project ARIA", "Full Disclosure: Project CASSANDRA")
rep('referred to internally as "Aria"', 'referred to internally as "Cassandra"')
rep("name: 'aria-socket'", "name: 'cassandra-socket'")
rep("name: 'aria-protocol'", "name: 'cassandra-protocol'", 5)
rep("aria_key.bin", "subnet_key.bin", 2)  # file name + the filename part of its path
rep("/root/.aria/subnet_key.bin", "/root/.cassandra/subnet_key.bin")
rep("ARIA ACCESS KEY v3", "CASSANDRA ACCESS KEY v3")
rep("project_aria_summary.txt", "project_cassandra_summary.txt", 2)
rep("PROJECT ARIA — EYES ONLY", "PROJECT CASSANDRA — EYES ONLY")
rep("Aria began as a market prediction model.", "Cassandra began as a market prediction model.")
for suffix in ["SURVEILLANCE", "BEHAVIOURAL", "PERSONNEL", "CORE", "DECISION"]:
    rep(f"label: 'ARIA {suffix}'", f"label: 'CASSANDRA {suffix}'")
open(p, 'w').write(s)
```

Notes: the `rep("/legal/aria/", …, 2)` and `rep("ARIA_BOARD_DISCLOSURE", …, 2)` counts assume the flavour text was rewritten first (as ordered above). If an assertion fails, re-read the current text and adjust the count, not the intent.

Then:
- `src/data/contracts.ts`: change the tool entry to key `'subnet-key'`, `id: 'subnet-key'`, `name: 'Restricted Subnet Key'`, `description: 'Authentication token granting access to the restricted subnetwork (172.16.0.0/16).'`; `src/data/contracts.test.ts` line 14: `'aria-key'` → `'subnet-key'`.
- `src/types/game.ts`: `ToolId` union `'aria-key'` → `'subnet-key'`.
- `src/engine/commands.ts`: 
  - both `'/legal/aria/ARIA_BOARD_DISCLOSURE'` → `'/legal/cassandra/CASSANDRA_BOARD_DISCLOSURE'`; update the two `// … ARIA_BOARD_DISCLOSURE …` comments;
  - `const isAriaKey = file.path === '/root/.aria/aria_key.bin';` → `const isSubnetKey = file.path === '/root/.cassandra/subnet_key.bin';` (rename uses);
  - tool push: `id: 'subnet-key'`, `name: 'Restricted Subnet Key'`, `description: 'Authentication token granting access to the restricted subnetwork (172.16.0.0/16).'`;
  - banner lines: `'// RESTRICTED SUBNET KEY ACQUIRED'`, keep `'// Restricted subnetwork 172.16.0.0/16 is now reachable.'`, `'// Tool added: Restricted Subnet Key'`.
- `src/engine/ariaMutations.ts`: hint file `` `/tmp/.hint_${String(state.turnCount)}.txt` `` and name `` `.hint_${String(state.turnCount)}.txt` ``; the modify tag: `const tag = isAriaNameKnown(state) ? 'ARIA' : 'CASSANDRA';` and content `` `// [${tag}] Intelligence updated: Cross-reference with exec layer for access chain.` `` (import `isAriaNameKnown` from `./ariaName`; compute `tag` from the state passed to that mutation).
- `src/data/employeeData.ts`: delete the `'Aria',` entry from `FIRST_NAMES`.
- Update existing tests: in `commands.test.ts` rename `exfil aria_key.bin` → `exfil subnet_key.bin`, `'aria_key.bin'`/`'/root/.aria/aria_key.bin'` fixtures → `'subnet_key.bin'`/`'/root/.cassandra/subnet_key.bin'`, `t.id === 'aria-key'` → `'subnet-key'`, `exploit aria-socket` → `exploit cassandra-socket`, banner assertions (`ARIA KEY ACQUIRED` → `RESTRICTED SUBNET KEY ACQUIRED`, `Tool added: aria-key` → `Tool added: Restricted Subnet Key`), and the Task 1 key-exfil test; in `commands.forks.test.ts` the fixture name/path and every `cat /legal/aria/ARIA_BOARD_DISCLOSURE` → `cat /legal/cassandra/CASSANDRA_BOARD_DISCLOSURE`; in `ariaMutations.test.ts` the expected hint paths `/tmp/.aria_hint_7.txt` / `_3` → `/tmp/.hint_7.txt` / `/tmp/.hint_3.txt` and any `[ARIA]` content assertion → `[CASSANDRA]` (add one test asserting `[ARIA]` once `flags.ARIA_NAME_KNOWN` is set).

- [ ] **Step 4: Implement the save migration**

`src/engine/saveMigration.ts`:

```ts
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

const migrateName = (name: string): string => name.replace(HINT_NAME, '.hint_$1.txt');

const KEY_TOOL = {
  id: 'subnet-key',
  name: 'Restricted Subnet Key',
  description: 'Authentication token granting access to the restricted subnetwork (172.16.0.0/16).',
};

export const migrateSavePaths = (save: SaveState): SaveState => {
  const nodes = Object.fromEntries(
    Object.entries(save.network.nodes).map(([id, delta]) => {
      const next = { ...delta };
      next.cachedFileContents = Object.fromEntries(
        Object.entries(delta.cachedFileContents ?? {}).map(([p, c]) => [migratePath(p), c]),
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
    player: {
      ...save.player,
      exfiltratedPaths: save.player.exfiltratedPaths.map(migratePath),
      tools: save.player.tools.map(t => (t.id === 'aria-key' ? { ...t, ...KEY_TOOL } : t)),
    },
    network: { ...save.network, nodes },
  };
};
```

`src/engine/persistence.ts`: `export` the `SaveState` interface (type only), import `migrateSavePaths`, and in `loadGame` call `fromSaveState(migrateSavePaths(save))`. (`tools` typed as `Tool[]` where `id: ToolId`: the `aria-key` comparison needs a cast-free approach — compare `(t.id as string) === 'aria-key'`; if lint flags the cast as unnecessary, type the legacy field as `string` via `const legacyId: string = t.id;`.)

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run src/data src/engine && pnpm tsc -b`
Expected: PASS, including the guard test (no leaks) and every updated test.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat: rewrite pre-reveal text to CASSANDRA and migrate old saves (#212)"
```

---

### Task 3 (#212, part 2): Gated UI strings, engine-output guard, final checks

**Files:**
- Modify: `src/components/HelpModal.tsx`, `src/components/DossierWindow.tsx`, `src/components/MapModal.tsx`, `src/engine/commands.ts` (`msg` usage), `src/App.tsx`, `CLAUDE.md`
- Test: `src/engine/__tests__/ariaNameWalk.test.ts` (new), `src/components/HelpModal.test.tsx` (new), `src/components/DossierWindow.test.tsx`, `src/components/MapModal.test.tsx` (new)

**Interfaces:**
- Consumes: `isAriaNameKnown`, `buildNodeMap`.
- Produces: `HelpModal` prop `ariaNameKnown: boolean`; `DossierWindow` prop `nameKnown: boolean`; `MapModal` derives it from `gameState`.

- [ ] **Step 1: Write the failing tests**

`src/engine/__tests__/ariaNameWalk.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import { createInitialState } from '../state';
import produce from '../produce';
import { buildNodeMap } from '../../data/anchorNodes';
import { SENTINEL_VOTE_PATH } from '../ariaName';
import type { GameState } from '../../types/game';

const ARIA = /aria/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

const textOf = (result: { lines: { content: string }[] }) =>
  result.lines.map(l => l.content).join('\n');

const atNode = (nodeId: string): GameState =>
  produce(createInitialState(), s => {
    s.network.currentNodeId = nodeId;
    s.network.nodes[nodeId]!.accessLevel = 'root';
  });

describe('engine output never says Aria before the reveal', () => {
  const lowerNodes = Object.values(buildNodeMap()).filter(n => n.layer < 5);

  it.each(lowerNodes.map(n => [n.id]))('ls / scan / status / whoami / inventory at %s', async id => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const state = atNode(id);
    for (const cmd of ['ls', 'scan', 'status', 'whoami', 'inventory']) {
      expect(textOf(await resolveCommand(cmd, state)), `${id}: ${cmd}`).not.toMatch(ARIA);
    }
  });

  it.each(lowerNodes.map(n => [n.id]))('cat and exfil of every file at %s', async id => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const state = atNode(id);
    for (const file of state.network.nodes[id]!.files) {
      if (file.path === SENTINEL_VOTE_PATH) continue; // the one allowed bridge
      const cat = await resolveCommand(`cat ${file.path}`, state);
      expect(textOf(cat), `${id}: cat ${file.path}`).not.toMatch(ARIA);
      const exfil = await resolveCommand(`exfil ${file.path}`, state);
      expect(textOf(exfil), `${id}: exfil ${file.path}`).not.toMatch(ARIA);
      const tools = ((exfil.nextState ?? state) as GameState).player.tools;
      expect(JSON.stringify(tools), `${id}: tools after ${file.path}`).not.toMatch(ARIA);
    }
  });

  it('exfiltrating the key keeps the name hidden, including in the inventory', async () => {
    const state = atNode('exec_ceo');
    const exfil = await resolveCommand('exfil subnet_key.bin', state);
    expect(textOf(exfil)).not.toMatch(ARIA);
    const inventory = await resolveCommand('inventory', exfil.nextState as GameState);
    expect(textOf(inventory)).not.toMatch(ARIA);
    expect(textOf(inventory)).toMatch(/subnet-key/);
  });

  it('the msg usage line does not mention Aria until the name is known', async () => {
    const state = createInitialState();
    expect(textOf(await resolveCommand('msg', state))).not.toMatch(ARIA);
    const known = produce(state, s => {
      s.flags['ARIA_NAME_KNOWN'] = true;
    });
    expect(textOf(await resolveCommand('msg', known))).toMatch(/aria/i);
  });
});
```

`src/components/HelpModal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HelpModal } from './HelpModal';

describe('HelpModal', () => {
  it('does not mention Aria before the name is known', () => {
    const { container } = render(<HelpModal ariaNameKnown={false} />);
    expect(container.textContent).not.toMatch(/aria/i);
    expect(container.textContent).toMatch(/msg sentinel/);
  });

  it('lists msg aria and the aria memory once the name is known', () => {
    const { container } = render(<HelpModal ariaNameKnown />);
    expect(container.textContent).toMatch(/msg aria <message>/);
    expect(container.textContent).toMatch(/aria memory/i);
  });
});
```

Append to `src/components/DossierWindow.test.tsx` (keep its existing helpers; the component gains a `nameKnown` prop — update existing renders to pass `nameKnown`):

```tsx
describe('DossierWindow — naming rule', () => {
  it('uses a neutral heading until the name is known, and "Aria memory" after', () => {
    const dossier = { runsCompleted: 0, endings: [], ariaMemory: [] } as never;
    const { container, rerender } = render(<DossierWindow dossier={dossier} nameKnown={false} />);
    expect(container.textContent).not.toMatch(/aria/i);
    expect(container.textContent).toMatch(/Memory/);
    rerender(<DossierWindow dossier={dossier} nameKnown />);
    expect(container.textContent).toMatch(/Aria memory/);
  });
});
```

`src/components/MapModal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MapModal } from './MapModal';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';

describe('MapModal', () => {
  it('shows discovered layer-5 nodes under neutral CASSANDRA labels, never Aria, before the reveal', () => {
    const state = produce(createInitialState(), s => {
      for (const n of Object.values(s.network.nodes)) {
        if (n?.layer === 5) n.discovered = true;
      }
    });
    const { container } = render(<MapModal gameState={state} />);
    expect(container.textContent).toMatch(/CASSANDRA/);
    expect(container.textContent).not.toMatch(/aria/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/engine/__tests__/ariaNameWalk.test.ts src/components/HelpModal.test.tsx src/components/DossierWindow.test.tsx src/components/MapModal.test.tsx`
Expected: FAIL (usage line, help text, dossier heading, map layer label still say Aria; `ariaNameKnown`/`nameKnown` props unknown). If the walk finds any **other** leaking command output, note it: fix it in Step 3 with neutral wording and keep the assertion.

- [ ] **Step 3: Implement**

- `src/engine/commands.ts` (`msg` handling, the usage line `Usage: msg [sentinel|aria] <message>`): `isAriaNameKnown(state) ? 'Usage: msg [sentinel|aria] <message>' : 'Usage: msg sentinel <message>'`. Leave `msg aria <message>` itself working (hidden command).
- `src/components/HelpModal.tsx`: add `interface Props { ariaNameKnown: boolean }`; show `  dossier       -cross-run dossier` (no "aria memory") and omit the `msg aria <message> …` line when `!ariaNameKnown` (build the line arrays from the prop). Pre-reveal the MESSAGING section lists only `msg sentinel`.
- `src/components/DossierWindow.tsx`: prop `nameKnown: boolean`; heading `{nameKnown ? 'Aria memory' : 'Memory'}`.
- `src/components/MapModal.tsx`: `const LAYER_LABELS = ['ENTRY', 'OPS', 'SECURITY', 'FINANCE', 'EXECUTIVE', 'CASSANDRA'];`.
- `src/App.tsx`: compute `const ariaNameKnown = gameState ? isAriaNameKnown(gameState) : false;` (import `isAriaNameKnown` from `./engine/ariaName`) and pass `<HelpModal ariaNameKnown={ariaNameKnown} />` and `<DossierWindow dossier={loadDossier()} nameKnown={ariaNameKnown || loadDossier().runsCompleted > 0} />`. (After a completed run the player already knows the name, so the dossier shows it on later runs.)
- `CLAUDE.md`: add a short "Naming rule" note under the tiled-layout section: the name "Aria" is hidden until `ARIA_NAME_KNOWN` (`src/engine/ariaName.ts`); pre-reveal text uses CASSANDRA; the vote file is the only allowed bridge; guard tests are `src/data/__tests__/ariaNameLeak.test.ts` and `src/engine/__tests__/ariaNameWalk.test.ts`.

- [ ] **Step 4: Run the full checks**

Run, in order: `pnpm format`, `pnpm tsc -b`, `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip`
Expected: all pass.

- [ ] **Step 5: Verify in the browser**

Start a throwaway dev server (`pnpm exec vite --port 5199 --strictPort`) and drive it with a Playwright script: log in and, at each node you can reach, run `ls`, `cat` a file, `scan`, `help` (overlay), `dossier` (overlay), `notes`, `map`; then (by patching the saved game as in earlier scripts) put the player at `exec_ceo` with admin access, `exfil subnet_key.bin`, run `inventory`, open `map` and `notes`, and run `scan` to see the layer-5 labels; capture screenshots and assert no visible text matches `/aria/i` anywhere (page `innerText`) up to that point. Then `cat` the board vote from `exec_cfo` and confirm the name now appears (`help` lists `msg aria`; the dossier heading says "Aria memory"). Finally connect to a layer-5 node in a fresh run and confirm the same flip. Kill the server by its port listener afterwards.

- [ ] **Step 6: Commit**

```bash
git add -A src CLAUDE.md
git commit -m "feat: gate the Aria name in help, dossier, map and msg usage (#212)"
```
