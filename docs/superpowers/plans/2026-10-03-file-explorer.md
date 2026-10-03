# File Explorer Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `explorer` floating window that browses the connected node's files (and the exfiltrated "Local" cache) and runs `cat` / `exfil` through the normal command pipeline.

**Architecture:** A pure `fileTree` module builds a directory tree from `GameFile.path`s using the same visibility rule as `ls`. A new `ExplorerWindow` component renders it and dispatches commands through the existing `handleSubmit` (approach A in the spec), so all game rules stay in one place. A new persisted `GameState.filesRead` records successful reads so the viewer can't reveal unread authored content for free.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library (jsdom), pure CSS in `src/styles/globals.css`.

**Spec:** `docs/superpowers/specs/2026-10-03-file-explorer-design.md`

## Global Constraints

- `SAVE_VERSION` in `src/engine/persistence.ts` stays **6** (a bump discards every player's save). `filesRead` is optional on the save and defaults to `[]`.
- Explorer actions must go through `handleSubmit` (the same path as typed commands); never call `cmdCat` / `cmdExfil` directly from UI code.
- Style: arrow functions only (`func-style`), semicolons, single quotes, trailing commas, 100-col, no `console.*` in `src/` (only `warn`).
- Tests: 75% per-file coverage threshold (statements, branches, functions, lines); `pnpm knip` must stay clean for new files.
- Component test files start with `// @vitest-environment jsdom` (vitest default env is `node`).
- Commit messages follow Conventional Commits and end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Pre-commit checks, in order, before every commit: `pnpm format`, `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip`.
- Do not touch unrelated windows or modernize other window content.

## Review Focus

- Two files with the same name in different directories (e.g. `config.ini` under `/etc/a` and `/etc/b`): Open/Exfil must target the **full path**, never the bare name, so the right file is read. (Task 3)
- A node file whose `content` is non-null but which was never `cat`'d: the viewer must show the "Not read yet" placeholder, not the content. (Task 3)
- `cat` that falls back to `FILE_CONTENT_FALLBACK` (AI offline) or is denied: `filesRead` must not gain an entry, so the player can retry. (Task 1)
- The selected file is deleted by the sentinel or the player disconnects to another node: the detail/viewer pane must disappear, not show stale data or throw. (Task 3)
- Files with odd paths (no leading slash, trailing slash, empty string, duplicate paths): they must still appear in the tree, never be dropped or crash the builder. (Task 2)
- A save written before this feature (no `filesRead` field) must load with `filesRead === []`. (Task 1)
- Explorer used while the terminal is busy or in a non-play phase (login, burned, scanning): all actions disabled. (Task 3, Task 4)

## File Structure

- **Create** `src/engine/fileTree.ts` — pure: `listAccessibleFiles`, `buildFileTree`, `TreeEntry`.
- **Create** `src/engine/fileTree.test.ts`
- **Create** `src/components/ExplorerWindow.tsx` — window content (tree, detail, viewer).
- **Create** `src/components/ExplorerWindow.test.tsx`
- **Modify** `src/types/game.ts` — `GameState.filesRead`, `fileReadKey()`.
- **Modify** `src/engine/state.ts` — initialise `filesRead: []`.
- **Modify** `src/engine/commands.ts` — `cmdCat` records reads; `cmdLs` uses `listAccessibleFiles`; `explorer`/`files` verbs.
- **Modify** `src/engine/persistence.ts` — save/load `filesRead`.
- **Modify** `src/engine/windowManager.ts` — `explorer` kind + default size.
- **Modify** `src/components/Desktop.tsx` — `explorer` prop, title, accent.
- **Modify** `src/App.tsx` — intercept `explorer`/`files`, render `ExplorerWindow`.
- **Modify** `src/components/HelpModal.tsx` — document the command.
- **Modify** `src/styles/globals.css` — explorer styles.
- **Modify** existing tests that enumerate window kinds / render `Desktop` (see Task 4).

Deviations from the spec, both small and intentional: (1) Exfil runs `exfil <full path>` rather than `exfil <name>` — `cmdExfil` accepts a path, and a bare name is ambiguous across directories. (2) There is no separate `buildLocalTree`; the Local root reuses `buildFileTree(exfiltrated)` because the shape is identical.

---

### Task 1: `filesRead` state, recording in `cmdCat`, persistence

**Files:**
- Modify: `src/types/game.ts` (add field near `ariaInfluencedFilesRead`, helper near `hasAccess`)
- Modify: `src/engine/state.ts:96`
- Modify: `src/engine/commands.ts` (`cmdCat`, just before `// Track ariaPlanted files the player reads`)
- Modify: `src/engine/persistence.ts` (`SaveState`, `toSaveState`, `fromSaveState`)
- Test: `src/engine/commands.test.ts`, `src/engine/persistence.test.ts`

**Interfaces:**
- Produces: `GameState.filesRead: string[]`; `fileReadKey(nodeId: string, path: string): string` exported from `src/types/game.ts`, returning `` `${nodeId}:${path}` ``. Tasks 3 consumes both.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/commands.test.ts` (add `import { hasAccess, fileReadKey } from '../types/game';` to the imports):

```ts
describe('cmdCat — filesRead', () => {
  const NODE_ID = 'contractor_portal';

  const openState = (): GameState =>
    produce(createInitialState(), s => {
      s.network.nodes[NODE_ID]!.accessLevel = 'user';
    });

  const readableFile = (state: GameState) =>
    state.network.nodes[NODE_ID]!.files.find(
      f => !f.tripwire && !f.locked && f.content !== null && hasAccess('user', f.accessRequired),
    )!;

  it('records the file key after a successful read', async () => {
    const state = openState();
    const file = readableFile(state);
    const result = await resolveCommand(`cat ${file.path}`, state);
    const next = result.nextState as GameState;
    expect(next.filesRead).toEqual([fileReadKey(NODE_ID, file.path)]);
  });

  it('does not record the same file twice', async () => {
    const state = openState();
    const file = readableFile(state);
    const first = (await resolveCommand(`cat ${file.path}`, state)).nextState as GameState;
    const second = (await resolveCommand(`cat ${file.path}`, first)).nextState as GameState;
    expect(second.filesRead).toHaveLength(1);
  });

  it('does not record anything when access is denied', async () => {
    const state = produce(createInitialState(), s => {
      s.network.nodes[NODE_ID]!.accessLevel = 'none';
    });
    const file = readableFile(openState());
    const result = await resolveCommand(`cat ${file.path}`, state);
    expect((result.nextState ?? state).filesRead).toEqual([]);
  });

  it('does not record a read that fell back to the offline placeholder', async () => {
    const base = openState();
    const file = readableFile(base);
    const state = produce(base, s => {
      s.network.nodes[NODE_ID]!.files.find(f => f.path === file.path)!.content = null;
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    try {
      const result = await resolveCommand(`cat ${file.path}`, state);
      expect((result.nextState ?? state).filesRead).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
```

Append to `src/engine/persistence.test.ts` (inside a new `describe`, reusing `makeMockStorage`):

```ts
describe('filesRead persistence', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips filesRead', () => {
    const state = produce(createInitialState(), s => {
      s.filesRead = ['contractor_portal:/var/www/contractor/welcome.txt'];
    });
    saveGame(state);
    expect(loadGame()?.filesRead).toEqual(['contractor_portal:/var/www/contractor/welcome.txt']);
  });

  it('loads a save written before filesRead existed as []', () => {
    saveGame(createInitialState());
    const raw = JSON.parse(mockStorage.getItem(SAVE_KEY) as string) as Record<string, unknown>;
    delete raw['filesRead'];
    mockStorage.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(loadGame()?.filesRead).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/engine/commands.test.ts src/engine/persistence.test.ts`
Expected: FAIL (TypeScript/undefined: `fileReadKey` not exported, `filesRead` undefined).

- [ ] **Step 3: Implement**

`src/types/game.ts` — in `GameState`, after `ariaInfluencedFilesRead`:

```ts
  filesRead: string[]; // fileReadKey(nodeId, path) of node files the player has successfully cat'd
```

and next to `hasAccess`:

```ts
export const fileReadKey = (nodeId: string, path: string): string => `${nodeId}:${path}`;
```

`src/engine/state.ts` — next to `ariaInfluencedFilesRead: [],`:

```ts
    filesRead: [],
```

`src/engine/commands.ts` — add `fileReadKey` to the existing `'../types/game'` value import (`hasAccess` is already imported from there), then in `cmdCat` immediately before `// Track ariaPlanted files the player reads`:

```ts
  // Record successful reads so the explorer can tell read from unread files.
  // Fallback content is a failed read — leave it unrecorded so the player can retry.
  if (content !== FILE_CONTENT_FALLBACK) {
    const readKey = fileReadKey(node.id, file.path);
    if (!next.filesRead.includes(readKey)) {
      next = produce(next, s => {
        s.filesRead.push(readKey);
      });
    }
  }
```

`src/engine/persistence.ts`:
- In `SaveState`, after `recentCommands: string[];`: `filesRead?: string[]; // optional for backwards compat — no SAVE_VERSION bump`
- In `toSaveState`'s returned object, after `recentCommands: state.recentCommands,`: `filesRead: state.filesRead,`
- In `fromSaveState`, after `state.recentCommands = save.recentCommands;`: `state.filesRead = save.filesRead ?? [];`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/engine/commands.test.ts src/engine/persistence.test.ts`
Expected: PASS. If an existing test asserts the exact set of save keys or a literal `GameState` shape, add `filesRead` to that expectation.

- [ ] **Step 5: Commit**

```bash
git add src/types/game.ts src/engine/state.ts src/engine/commands.ts src/engine/persistence.ts src/engine/commands.test.ts src/engine/persistence.test.ts
git commit -m "feat: track successfully read files in GameState.filesRead"
```

---

### Task 2: `fileTree` module and shared `ls` visibility filter

**Files:**
- Create: `src/engine/fileTree.ts`
- Create: `src/engine/fileTree.test.ts`
- Modify: `src/engine/commands.ts:1175-1178` (`cmdLs`)

**Interfaces:**
- Consumes: `hasAccess`, `GameFile`, `LiveNode` from `src/types/game.ts`.
- Produces:
  - `type TreeEntry = { kind: 'dir'; name: string; path: string; children: TreeEntry[] } | { kind: 'file'; name: string; path: string; file: GameFile }`
  - `listAccessibleFiles(node: LiveNode): GameFile[]`
  - `buildFileTree(files: readonly GameFile[]): TreeEntry[]`

- [ ] **Step 1: Write the failing tests**

`src/engine/fileTree.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFileTree, listAccessibleFiles } from './fileTree';
import type { TreeEntry } from './fileTree';
import type { GameFile, LiveNode } from '../types/game';

const file = (path: string, overrides: Partial<GameFile> = {}): GameFile => ({
  name: path.split('/').filter(Boolean).pop() ?? path,
  path,
  type: 'document',
  content: 'x',
  exfiltrable: true,
  accessRequired: 'user',
  ...overrides,
});

const names = (entries: TreeEntry[]) => entries.map(e => `${e.kind}:${e.name}`);

describe('listAccessibleFiles', () => {
  const node = (accessLevel: LiveNode['accessLevel'], files: GameFile[]) =>
    ({ accessLevel, files }) as LiveNode;

  it('hides deleted files and files above the player access level', () => {
    const visible = file('/a/visible.txt');
    const files = [
      visible,
      file('/a/deleted.txt', { deleted: true }),
      file('/a/admin.txt', { accessRequired: 'admin' }),
    ];
    expect(listAccessibleFiles(node('user', files))).toEqual([visible]);
  });

  it('returns nothing when not authenticated', () => {
    expect(listAccessibleFiles(node('none', [file('/a/b.txt')]))).toEqual([]);
  });
});

describe('buildFileTree', () => {
  it('nests files under directories derived from their paths', () => {
    const tree = buildFileTree([file('/var/log/access_log'), file('/etc/vpn/routing.cfg')]);
    expect(names(tree)).toEqual(['dir:etc', 'dir:var']);
    const var_ = tree[1] as Extract<TreeEntry, { kind: 'dir' }>;
    expect(var_.path).toBe('/var');
    expect(names(var_.children)).toEqual(['dir:log']);
    const log = var_.children[0] as Extract<TreeEntry, { kind: 'dir' }>;
    expect(log.path).toBe('/var/log');
    expect(names(log.children)).toEqual(['file:access_log']);
  });

  it('sorts directories before files, each alphabetically', () => {
    const tree = buildFileTree([file('/b.txt'), file('/zdir/c.txt'), file('/a.txt'), file('/adir/d.txt')]);
    expect(names(tree)).toEqual(['dir:adir', 'dir:zdir', 'file:a.txt', 'file:b.txt']);
  });

  it('keeps same-named files in different directories as separate entries', () => {
    const a = file('/etc/a/config.ini');
    const b = file('/etc/b/config.ini');
    const tree = buildFileTree([a, b]);
    const etc = tree[0] as Extract<TreeEntry, { kind: 'dir' }>;
    const [da, db] = etc.children as Extract<TreeEntry, { kind: 'dir' }>[];
    expect((da.children[0] as Extract<TreeEntry, { kind: 'file' }>).file).toBe(a);
    expect((db.children[0] as Extract<TreeEntry, { kind: 'file' }>).file).toBe(b);
  });

  it('never drops files with odd paths', () => {
    const noSlash = file('readme.txt');
    const trailing = file('/docs/notes.txt/');
    const empty = file('', { name: 'mystery' });
    const dupA = file('/dup/x.txt');
    const dupB = file('/dup/x.txt');
    const tree = buildFileTree([noSlash, trailing, empty, dupA, dupB]);
    const collect = (entries: TreeEntry[]): GameFile[] =>
      entries.flatMap(e => (e.kind === 'file' ? [e.file] : collect(e.children)));
    const all = collect(tree);
    expect(all).toHaveLength(5);
    expect(all).toEqual(expect.arrayContaining([noSlash, trailing, empty, dupA, dupB]));
  });

  it('returns an empty tree for no files', () => {
    expect(buildFileTree([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/engine/fileTree.test.ts`
Expected: FAIL — module `./fileTree` not found.

- [ ] **Step 3: Implement**

`src/engine/fileTree.ts`:

```ts
import { hasAccess } from '../types/game';
import type { GameFile, LiveNode } from '../types/game';

export type TreeEntry =
  | { kind: 'dir'; name: string; path: string; children: TreeEntry[] }
  | { kind: 'file'; name: string; path: string; file: GameFile };

type DirEntry = Extract<TreeEntry, { kind: 'dir' }>;

// The single visibility rule shared by `ls` and the explorer, so they cannot drift.
export const listAccessibleFiles = (node: LiveNode): GameFile[] =>
  node.files.filter(f => !f.deleted && hasAccess(node.accessLevel, f.accessRequired));

const sortEntries = (entries: TreeEntry[]): TreeEntry[] =>
  entries
    .map(e => (e.kind === 'dir' ? { ...e, children: sortEntries(e.children) } : e))
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
    );

export const buildFileTree = (files: readonly GameFile[]): TreeEntry[] => {
  const root: TreeEntry[] = [];

  for (const file of files) {
    const segments = file.path.split('/').filter(s => s !== '');
    // A path with no usable segments (e.g. '') still has to show up: fall back to the name.
    const leafName = segments.pop() ?? file.name;

    let level = root;
    let dirPath = '';
    for (const segment of segments) {
      dirPath = `${dirPath}/${segment}`;
      let dir = level.find((e): e is DirEntry => e.kind === 'dir' && e.name === segment);
      if (!dir) {
        dir = { kind: 'dir', name: segment, path: dirPath, children: [] };
        level.push(dir);
      }
      level = dir.children;
    }
    level.push({ kind: 'file', name: leafName, path: file.path, file });
  }

  return sortEntries(root);
};
```

`src/engine/commands.ts` — `cmdLs`: replace

```ts
  const accessible = node.files.filter(
    f => !f.deleted && hasAccess(node.accessLevel, f.accessRequired),
  );
```

with `const accessible = listAccessibleFiles(node);` and add `import { listAccessibleFiles } from './fileTree';`. (`hasAccess` stays imported — other code in the file still uses it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/engine/fileTree.test.ts src/engine/commands.test.ts`
Expected: PASS (existing `ls` tests prove output is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/engine/fileTree.ts src/engine/fileTree.test.ts src/engine/commands.ts
git commit -m "feat: add file tree builder and share ls visibility filter"
```

---

### Task 3: `ExplorerWindow` component

**Files:**
- Create: `src/components/ExplorerWindow.tsx`
- Create: `src/components/ExplorerWindow.test.tsx`
- Modify: `src/styles/globals.css` (append explorer styles)

**Interfaces:**
- Consumes: `buildFileTree`, `listAccessibleFiles`, `TreeEntry` (Task 2); `fileReadKey`, `GameState`, `GameFile` (Task 1 / types); `currentNode` from `src/engine/state.ts`.
- Produces: `ExplorerWindow` with props `{ gameState: GameState; onRunCommand: (cmd: string) => void; disabled: boolean }`. Task 4 renders it.
- Commands emitted: Open on a node file → `` `cat ${file.path}` ``; Open on a local file → `` `cat local:${file.name}` ``; Exfil → `` `exfil ${file.path}` ``.

- [ ] **Step 1: Write the failing tests**

`src/components/ExplorerWindow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExplorerWindow } from './ExplorerWindow';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import { fileReadKey } from '../types/game';
import type { GameFile, GameState } from '../types/game';

const NODE_ID = 'contractor_portal';

const makeFile = (path: string, overrides: Partial<GameFile> = {}): GameFile => ({
  name: path.split('/').pop() as string,
  path,
  type: 'document',
  content: `content of ${path}`,
  exfiltrable: true,
  accessRequired: 'user',
  ...overrides,
});

const stateWith = (files: GameFile[], mutate?: (s: GameState) => void): GameState =>
  produce(createInitialState(), s => {
    const node = s.network.nodes[NODE_ID]!;
    node.accessLevel = 'user';
    node.files = files;
    mutate?.(s);
  });

const setup = (state: GameState, disabled = false) => {
  const onRunCommand = vi.fn();
  const view = render(
    <ExplorerWindow gameState={state} onRunCommand={onRunCommand} disabled={disabled} />,
  );
  return { onRunCommand, ...view };
};

const select = (name: string) => {
  fireEvent.click(screen.getByText(name));
};

describe('ExplorerWindow — tree', () => {
  it('shows top-level directories expanded and deeper ones collapsed until toggled', () => {
    setup(stateWith([makeFile('/var/www/site/index.html')]));
    expect(screen.getByText('var')).toBeTruthy();
    expect(screen.getByText('www')).toBeTruthy();
    expect(screen.queryByText('index.html')).toBeNull();
    fireEvent.click(screen.getByText('www'));
    expect(screen.getByText('site')).toBeTruthy();
  });

  it('collapses an expanded top-level directory', () => {
    setup(stateWith([makeFile('/etc/a.cfg')]));
    expect(screen.getByText('a.cfg')).toBeTruthy();
    fireEvent.click(screen.getByText('etc'));
    expect(screen.queryByText('a.cfg')).toBeNull();
  });

  it('hides files the player cannot access or that are deleted', () => {
    setup(
      stateWith([
        makeFile('/a/ok.txt'),
        makeFile('/a/admin.txt', { accessRequired: 'admin' }),
        makeFile('/a/gone.txt', { deleted: true }),
      ]),
    );
    expect(screen.getByText('ok.txt')).toBeTruthy();
    expect(screen.queryByText('admin.txt')).toBeNull();
    expect(screen.queryByText('gone.txt')).toBeNull();
  });

  it('shows ls-style badges', () => {
    setup(
      stateWith([
        makeFile('/a/trap.txt', { tripwire: true }),
        makeFile('/a/pinned.txt', { exfiltrable: false }),
        makeFile('/a/sealed.txt', { locked: true }),
        makeFile('/a/tool.bin', { isTool: true }),
      ]),
    );
    expect(screen.getByText('[!]')).toBeTruthy();
    expect(screen.getByText('[no-exfil]')).toBeTruthy();
    expect(screen.getByText('[LOCKED]')).toBeTruthy();
    expect(screen.getByText('[TOOL]')).toBeTruthy();
  });

  it('marks files that have been read', () => {
    const state = stateWith([makeFile('/a/seen.txt'), makeFile('/a/unseen.txt')], s => {
      s.filesRead = [fileReadKey(NODE_ID, '/a/seen.txt')];
    });
    setup(state);
    expect(screen.getAllByLabelText('read')).toHaveLength(1);
  });

  it('shows permission denied instead of the node tree when not authenticated', () => {
    const state = stateWith([makeFile('/a/secret.txt')], s => {
      s.network.nodes[NODE_ID]!.accessLevel = 'none';
    });
    setup(state);
    expect(screen.getByText(/not authenticated/i)).toBeTruthy();
    expect(screen.queryByText('secret.txt')).toBeNull();
  });
});

describe('ExplorerWindow — selection and actions', () => {
  it('selecting a file shows details but runs no command', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]));
    select('vpn.cfg');
    expect(screen.getByText('/etc/vpn.cfg')).toBeTruthy();
    expect(onRunCommand).not.toHaveBeenCalled();
  });

  it('warns about the trace cost of a tripwire file when selected', () => {
    setup(stateWith([makeFile('/a/trap.txt', { tripwire: true })]));
    select('trap.txt');
    expect(screen.getByText(/reading this file triggers up to \+25 trace/i)).toBeTruthy();
  });

  it('Open runs cat with the full path', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]));
    select('vpn.cfg');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onRunCommand).toHaveBeenCalledWith('cat /etc/vpn.cfg');
  });

  it('double-clicking a file also opens it', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]));
    fireEvent.doubleClick(screen.getByText('vpn.cfg'));
    expect(onRunCommand).toHaveBeenCalledWith('cat /etc/vpn.cfg');
  });

  it('targets the right file when two directories hold the same file name', () => {
    const { onRunCommand } = setup(
      stateWith([makeFile('/etc/a/config.ini'), makeFile('/etc/b/config.ini')]),
    );
    fireEvent.click(screen.getByText('a'));
    fireEvent.click(screen.getByText('b'));
    const [, second] = screen.getAllByText('config.ini');
    fireEvent.click(second);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onRunCommand).toHaveBeenCalledWith('cat /etc/b/config.ini');
  });

  it('Exfil runs exfil with the full path', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]));
    select('vpn.cfg');
    fireEvent.click(screen.getByRole('button', { name: 'Exfil' }));
    expect(onRunCommand).toHaveBeenCalledWith('exfil /etc/vpn.cfg');
  });

  it('disables Exfil for no-exfil files', () => {
    setup(stateWith([makeFile('/a/pinned.txt', { exfiltrable: false })]));
    select('pinned.txt');
    expect((screen.getByRole('button', { name: 'Exfil' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('disables Open and Exfil while disabled', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]), true);
    select('vpn.cfg');
    expect((screen.getByRole('button', { name: 'Open' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Exfil' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.doubleClick(screen.getByText('vpn.cfg'));
    expect(onRunCommand).not.toHaveBeenCalled();
  });

  it('still lets Open run cat on a locked file so the terminal explains the denial', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/a/sealed.txt', { locked: true })]));
    select('sealed.txt');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onRunCommand).toHaveBeenCalledWith('cat /a/sealed.txt');
  });

  it('clears the detail pane when the selected file disappears', () => {
    const state = stateWith([makeFile('/etc/vpn.cfg')]);
    const { rerender, onRunCommand } = setup(state);
    select('vpn.cfg');
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    const gone = produce(state, s => {
      s.network.nodes[NODE_ID]!.files[0]!.deleted = true;
    });
    rerender(<ExplorerWindow gameState={gone} onRunCommand={onRunCommand} disabled={false} />);
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });
});

describe('ExplorerWindow — viewer', () => {
  it('does not reveal content of an unread file even though content exists in state', () => {
    setup(stateWith([makeFile('/a/doc.txt', { content: 'TOP SECRET BODY' })]));
    select('doc.txt');
    expect(screen.getByText(/not read yet/i)).toBeTruthy();
    expect(screen.queryByText('TOP SECRET BODY')).toBeNull();
  });

  it('shows content once the file is in filesRead', () => {
    const state = stateWith([makeFile('/a/doc.txt', { content: 'TOP SECRET BODY' })], s => {
      s.filesRead = [fileReadKey(NODE_ID, '/a/doc.txt')];
    });
    setup(state);
    select('doc.txt');
    expect(screen.getByText('TOP SECRET BODY')).toBeTruthy();
  });

  it('keeps the placeholder for a read file whose content is still null', () => {
    const state = stateWith([makeFile('/a/doc.txt', { content: null })], s => {
      s.filesRead = [fileReadKey(NODE_ID, '/a/doc.txt')];
    });
    setup(state);
    select('doc.txt');
    expect(screen.getByText(/not read yet/i)).toBeTruthy();
  });
});

describe('ExplorerWindow — local cache', () => {
  const withLocal = (files: GameFile[]) =>
    stateWith([makeFile('/a/ok.txt')], s => {
      s.player.exfiltrated = files;
    });

  it('lists exfiltrated files under Local and always shows their content', () => {
    setup(withLocal([makeFile('/var/db/loot.csv', { content: 'LOOT BODY' })]));
    fireEvent.click(screen.getByText('db'));
    select('loot.csv');
    expect(screen.getByText('LOOT BODY')).toBeTruthy();
  });

  it('opens a local file with cat local:<name> and cannot exfil it again', () => {
    const { onRunCommand } = setup(withLocal([makeFile('/loot.csv')]));
    select('loot.csv');
    expect((screen.getByRole('button', { name: 'Exfil' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onRunCommand).toHaveBeenCalledWith('cat local:loot.csv');
  });

  it('shows an empty-state hint when nothing has been exfiltrated', () => {
    setup(withLocal([]));
    expect(screen.getByText(/nothing exfiltrated yet/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/ExplorerWindow.test.tsx`
Expected: FAIL — module `./ExplorerWindow` not found.

- [ ] **Step 3: Implement the component**

`src/components/ExplorerWindow.tsx`:

```tsx
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
    onRunCommand(root === 'local' ? `cat local:${file.name}` : `cat ${file.path}`);
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
        {file.tripwire && <div className="explorer-warn">[!] reading this file triggers up to +25 trace</div>}
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
```

Append to `src/styles/globals.css`:

```css
.explorer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--font-mono);
}

.explorer-root {
  margin-top: 4px;
  color: var(--win-title-color);
  text-transform: uppercase;
  font-size: 11px;
}

.explorer-list {
  list-style: none;
  margin: 0;
  padding-left: 14px;
}

.explorer-tree > .explorer-list {
  padding-left: 0;
}

.explorer-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 1px 4px;
}

.explorer-row:hover {
  background: var(--win-border);
}

.explorer-file[aria-pressed='true'] {
  background: var(--win-border);
}

.explorer-badge {
  opacity: 0.7;
  font-size: 11px;
}

.explorer-read {
  margin-left: auto;
  color: var(--color-safe);
}

.explorer-empty,
.explorer-placeholder {
  opacity: 0.6;
  padding: 2px 4px;
}

.explorer-detail {
  border-top: 1px solid var(--win-border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.explorer-detail-name {
  font-weight: bold;
}

.explorer-warn {
  color: var(--color-error);
}

.explorer-actions {
  display: flex;
  gap: 8px;
}

.explorer-actions button {
  background: transparent;
  border: 1px solid var(--win-border);
  color: inherit;
  font: inherit;
  padding: 2px 10px;
  cursor: pointer;
}

.explorer-actions button:disabled {
  opacity: 0.4;
  cursor: default;
}

.explorer-viewer {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/components/ExplorerWindow.test.tsx`
Expected: PASS. If `getByText('a')` / `getByText('b')` in the duplicate-name test matches more than one element, scope with `{ selector: '.explorer-dir span' }`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExplorerWindow.tsx src/components/ExplorerWindow.test.tsx src/styles/globals.css
git commit -m "feat: add ExplorerWindow component"
```

---

### Task 4: Register the window, wire the command, update help

**Files:**
- Modify: `src/engine/windowManager.ts` (`WindowKind`, `WINDOW_KINDS`, `DEFAULT_SIZE`)
- Modify: `src/components/Desktop.tsx` (`Props`, `TITLES`, `ACCENTS`, `contents`, destructure)
- Modify: `src/App.tsx` (command intercept ~line 596-606; `<Desktop>` props ~line 866-900; `explorerDisabled`)
- Modify: `src/engine/commands.ts` (verbs near `case 'dossier':`, ~line 245)
- Modify: `src/components/HelpModal.tsx` (LOCAL COMMANDS list)
- Test: `src/engine/windowManager.test.ts`, `src/engine/windowLayoutPersistence.test.ts`, `src/components/Desktop.test.tsx`, `src/engine/commands.test.ts`, plus any test that fails because it enumerates six window kinds.

**Interfaces:**
- Consumes: `ExplorerWindow` (Task 3).
- Produces: `WindowKind` now includes `'explorer'`; `Desktop` takes a new required `explorer: ReactNode | null` prop; commands `explorer` / `files` open the window.

- [ ] **Step 1: Write the failing tests**

`src/engine/windowManager.test.ts` — add inside the `createDefaultLayout` describe:

```ts
  it('includes a closed explorer window', () => {
    const layout = createDefaultLayout(VIEWPORT);
    expect(layout.explorer.open).toBe(false);
    expect(layout.explorer.minimized).toBe(false);
  });
```

`src/engine/windowLayoutPersistence.test.ts` — append inside the main describe (it already imports `createDefaultLayout`, `WINDOW_KINDS`, `saveWindowLayout`, `loadWindowLayout`):

```ts
  it('loads a layout saved before the explorer window existed using its default instance', () => {
    const layout = createDefaultLayout(VIEWPORT);
    const { explorer: _omitted, ...withoutExplorer } = layout;
    mockStorage.getItem.mockReturnValueOnce(
      JSON.stringify({ version: 1, windows: withoutExplorer }),
    );
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded.explorer).toEqual(expect.objectContaining({ kind: 'explorer', open: false }));
  });
```

`src/components/Desktop.test.tsx` — add `explorer={<div>explorer-content</div>}` to the `<Desktop>` in `renderDesktop`, then add:

```ts
  it('opens the explorer window via the handle and shows its taskbar entry', () => {
    const ref = renderDesktop();
    expect(screen.queryByText('explorer-content')).toBeNull();
    act(() => {
      ref.current?.openWindow('explorer');
    });
    expect(screen.getByText('explorer-content')).toBeTruthy();
    expect(taskbarEntry('FILE EXPLORER')).toBeTruthy();
  });
```

`src/engine/commands.test.ts` — append:

```ts
describe('explorer / files verbs', () => {
  it.each(['explorer', 'files'])('%s returns no output and no AI call', async verb => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await resolveCommand(verb, createInitialState());
      expect(result.lines).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/engine/windowManager.test.ts src/engine/windowLayoutPersistence.test.ts src/components/Desktop.test.tsx src/engine/commands.test.ts`
Expected: FAIL (`explorer` is not a window kind; verbs fall through to the AI).

- [ ] **Step 3: Implement**

`src/engine/windowManager.ts`:
- `WindowKind`: add `'explorer'` (append: `... | 'dossier' | 'explorer'`).
- `WINDOW_KINDS`: append `'explorer'` after `'dossier'`.
- `DEFAULT_SIZE`: add `explorer: { width: 480, height: 420 },`.

`src/components/Desktop.tsx`:
- `Props`: add `explorer: ReactNode | null;` after `dossier`.
- `TITLES`: `explorer: 'FILE EXPLORER',`; `ACCENTS`: `explorer: '#ff7b72',`.
- Destructure `explorer` in the `forwardRef` args and add `explorer,` to the `contents` record.

`src/engine/commands.ts` — beside `case 'dossier':` add:

```ts
    case 'explorer':
    case 'files':
      result = { lines: [] }; // handled as a window in App
      break;
```

`src/App.tsx`:
- Import: `import { ExplorerWindow } from './components/ExplorerWindow';`
- After the `dossier` intercept block:

```ts
      const verb = raw.trim().toLowerCase();
      if (verb === 'explorer' || verb === 'files') {
        push([makeLine('input', raw)]);
        desktopRef.current?.openWindow('explorer');
        return;
      }
```

- After `inputDisabled`:

```ts
  const explorerDisabled = inputDisabled || (appPhase !== 'playing' && appPhase !== 'aria');
```

- In `<Desktop ...>` add:

```tsx
      explorer={
        gameState ? (
          <ExplorerWindow
            gameState={gameState}
            onRunCommand={cmd => {
              void handleSubmit(cmd);
            }}
            disabled={explorerDisabled}
          />
        ) : null
      }
```

`src/components/HelpModal.tsx` — after the `notes` line in LOCAL COMMANDS add:

```ts
  { text: r('  explorer      -file explorer (alias: files)'), color: 'var(--color-system)' },
```

- [ ] **Step 4: Run the full pre-commit checks**

Run, in order: `pnpm format`, `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip`
Expected: all pass. Likely follow-ups to fix in this step: tests that hardcode six window kinds or render `<Desktop>` without the new required `explorer` prop (add `explorer={null}`), and `Taskbar`/`windowManager` tests that snapshot the kind list.

- [ ] **Step 5: Manual check in the browser**

Run `pnpm dev`, log in (`ghost` / `nX-2847`), then: type `explorer` (window opens, tree empty or "not authenticated" before login to a node); `connect`/`login` to the contractor portal; select a file (no command echoes), Open (terminal shows the `cat` echo and the viewer fills in, ✓ appears), Exfil (terminal shows exfil, file appears under LOCAL); open a tripwire file's detail and confirm the warning; reload the page and confirm ✓ marks persist; maximize and resize the explorer window.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add file explorer window and explorer/files commands"
```
