# File Explorer Window — Design

## Purpose

Give the player a graphical front end for browsing and reading the files on the node they are
connected to, as a new floating window alongside Map, Notes, Help, Briefing and Dossier. It is a
friendlier way to run `ls`, `cat` and `exfil`, **not** a shortcut: every action goes through the
same engine logic as the typed command, so trace cost, tripwires, locks, AI file generation, turn
counting, sentinel reactions and autosave all still apply.

## Decisions (agreed)

| Question | Decision |
| --- | --- |
| Relationship to game rules | Same rules as commands. Explorer actions *are* commands. |
| First-version actions | Browse tree, open (read) file, exfil, browse local (exfiltrated) cache. |
| Integration approach | **A — command dispatch.** Explorer calls the existing `handleSubmit` with the equivalent command string; each action echoes in the terminal. |
| "Which files have I read" | **(i)** New persisted `GameState.filesRead`, recorded by `cmdCat`. |

## Out of scope

- Connecting/logging in/disconnecting from the explorer (overlaps the Map window).
- Search, sorting, file previews for unread files, drag and drop.
- Modernizing other windows' content.

## Architecture

### New window kind

`explorer` is added to `WindowKind` / `WINDOW_KINDS` in `src/engine/windowManager.ts`, with a
default size and `open: false`. It is closable and minimizable like Map and Notes. `TITLES` and
`ACCENTS` in `Desktop.tsx` get an entry. Layout persistence already falls back to the default
instance for any kind missing from a stored layout (`isValidInstance` fails), so existing saved
layouts load without a version bump; a test pins this.

### Opening

`App.tsx` intercepts `explorer` and `files` (case-insensitive) beside `map`/`notes`: push the input
line, call `desktopRef.current?.openWindow('explorer')`, return. `commands.ts` gets a matching
`case 'explorer'` / `'files'` returning `{ lines: [] }` (same as `notes`/`dossier`) so the verb never
falls through to the AI router. Help text and suggestion list mention the new command.

### Components and units

- **`src/engine/fileTree.ts`** (pure, no React)
  - `listAccessibleFiles(node)` — `!f.deleted && hasAccess(node.accessLevel, f.accessRequired)`.
    `cmdLs` is changed to use it so the tree and `ls` cannot drift.
  - `buildFileTree(files)` — splits `path` on `/` into a tree of `{ kind: 'dir' | 'file', name,
    path, children?, file? }`. Directories sort before files, both alphabetical.
  - `buildLocalTree(exfiltrated)` — same shape for the Local root.
- **`src/components/ExplorerWindow.tsx`** — window content. Props: `gameState`,
  `onRunCommand(cmd: string)`, `disabled`. Holds only UI state (expanded directories, selected
  entry).
- **`Desktop.tsx` / `App.tsx`** — new `explorer` slot (`ReactNode | null`, null until a game exists,
  like `map`/`notes`), wired with `onRunCommand={cmd => void handleSubmit(cmd)}` and
  `disabled={inputDisabled}`.

### State change: `filesRead`

- `GameState.filesRead: string[]` — entries are `${nodeId}:${path}`. Initialised `[]` in
  `createInitialState`.
- `cmdCat` appends the key after a **successful** read (not tripwire-denied gates, not
  `FILE_CONTENT_FALLBACK`, not locked/permission/not-found). Appending is idempotent.
  `cat local:` does not record anything: local files are always readable.
- Persistence: serialized as optional `filesRead?: string[]` on the save; `fromSaveState` defaults
  a missing value to `[]`. **`SAVE_VERSION` is not bumped** — a bump would discard every player's
  save, and the field is purely additive.

## Behaviour

### Tree

- Two roots: the connected node (label and IP) and **Local** (exfiltrated files). Directories expand
  and collapse; the first level starts expanded.
- Row badges match `ls`: `[!]` tripwire, `[no-exfil]`, `[LOCKED]`, `[TOOL]`. Read files show a
  read marker (from `filesRead`); local files show none.
- Not authenticated (`accessLevel === 'none'`) or not connected: the node root is replaced by
  "Permission denied — not authenticated", mirroring `cmdLs`. The Local root still works.

### Selecting vs. acting

- Clicking a file only **selects** it: the detail pane shows name, path, type, required access, and
  the badge legend lines that `ls` prints for that file. A tripwire file also shows the
  "reading this file triggers up to +25 trace" warning. Hidden `traceOnRead` costs are deliberately
  not previewed, because `ls` does not reveal them.
- **Open** (button; double-click is a shortcut) runs `cat <path>` for node files or
  `cat local:<name>` for local files. Locked files still run `cat`, so the terminal shows the usual
  denial and the `unlock` hint.
- **Exfil** runs `exfil <name>`. Disabled for `[no-exfil]` files and for local files.
- All actions are disabled while `disabled` is true (a command is in flight, or the phase is not
  `playing`/`aria`).

### Viewer

- Node files: shows `file.content` only if the file's key is in `filesRead` and content is non-null;
  otherwise "Not read yet — Open to read (may cost trace)". This is what prevents free reads of
  authored files whose content already exists in state.
- Local files: always show `content` (or the fallback string when null), no cost.
- A failed `cat` (not found, denied, AI fallback) does not change `filesRead`; the viewer keeps its
  placeholder and the reason is in the terminal.

## Error handling

- No new network calls: the AI path is the existing one inside `cmdCat`.
- A selected path that disappears (sentinel deletes the file, node changes on disconnect) clears the
  selection on the next render rather than showing stale details.
- Tree building is defensive about odd paths (no leading slash, trailing slash, duplicate names):
  files with unusual paths still appear, under the nearest sensible directory, never dropped.

## Testing

- `fileTree.test.ts`: visibility filter parity with `ls` (deleted, access level), nesting,
  sorting, odd paths, local tree.
- `commands.test.ts`: `cmdCat` records `filesRead` on success only; idempotent; `explorer`/`files`
  verbs return empty lines; `cmdLs` unchanged in output.
- `persistence.test.ts`: `filesRead` round-trips; a save without the field loads as `[]`.
- `windowManager.test.ts` / `windowLayoutPersistence.test.ts`: `explorer` default layout; an old
  stored layout lacking `explorer` loads with the default instance.
- `ExplorerWindow.test.tsx`: tree rendering and expand/collapse; select shows details and tripwire
  warning; Open/Exfil call `onRunCommand` with the exact commands; unread vs. read viewer;
  disabled and unauthenticated states; selection cleared when the file vanishes.
- `Desktop.test.tsx`: explorer opens via the handle and taskbar.
- Coverage stays at or above the 75% per-file threshold; `pnpm knip` clean.

## Risks

- **Shared `handleSubmit`:** it also handles phases (login, burned). The explorer must be inert
  outside `playing`/`aria`; covered by `disabled` and a test.
- **`cmdLs` refactor:** limited to extracting the visibility filter; output asserted unchanged.
- **`filesRead` growth:** bounded by the number of files in the run; negligible.
