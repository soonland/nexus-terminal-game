# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev           # start Vite dev server at localhost:5173
pnpm build         # tsc type check + Vite production build
pnpm lint          # ESLint (all files)
pnpm format        # Prettier write (all files)
pnpm preview       # preview production build locally
pnpm test          # Vitest run (all tests)
pnpm test:coverage # Vitest with v8 coverage — 75% threshold per file (statements, branches, functions, lines); configured in vitest.config.ts
pnpm test:ui       # Vitest browser UI
pnpm analyze       # production build + open bundle treemap
pnpm knip          # find unused exports, files, and dependencies
node playwright-playthrough.mjs [--headless] [--ending=1-4] [--url=...]  # full login-to-ending run against a running `pnpm dev`; records playthrough.webm, checks milestones (exit 1 on failure), opens every camera feed at layers 1, 3, 4 and 5 and saves a screenshot of each to playthrough-cameras/, prints the trace balance
```

Build (`pnpm build`) is the primary correctness check — it runs `tsc -b` before Vite, so TypeScript errors will fail the build.

## Tooling

- **ESLint** — `eslint.config.js`, `strictTypeChecked` ruleset, uses `tsconfig.eslint.json` (covers all files in one block). Arrow functions enforced (`func-style`), semicolons required, `no-console` is `error` (only `warn` allowed) in `src/` and `warn` in `api/`. The single exemption is `api/_lib/logger.ts`.
- **Prettier** — `.prettierrc.json`: single quotes, trailing commas, 100 char width, no arrow parens, bracket same line.
- **Husky + lint-staged** — pre-commit runs Prettier then ESLint on staged files only. `commit-msg` runs commitlint.
- **commitlint** — `commitlint.config.js`, enforces Conventional Commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, `revert`).
- **Knip** — `knip.json`, detects unused exports/files/dependencies. Run before PRs touching exports or deps.
- **MSW** — `src/mocks/` has Node server + handlers for the 4 API routes (`/api/world`, `/api/file`, `/api/aria`, `/api/mail`). Setup file is registered in `vitest.config.ts`.
- **Dependabot** — `.github/dependabot.yml`, weekly minor/major npm updates, grouped PRs, `chore(deps):` commit prefix.
- **Claude Code review** — `.github/workflows/claude-code-review.yml`, opt-in: a PR is reviewed only while it carries the `claude-review` label (`gh pr create --label claude-review`, or add the label later; remove it to stop). `@claude` mentions (`claude.yml`) are unaffected.
- **release-please** — `.github/workflows/release-please.yml`, opens a release PR on every merge to `main` with auto-generated changelog from conventional commits.

## Architecture

The game is a **client-side state machine** with a Vercel serverless backend for AI proxying (Phase 3). All core game logic runs in the browser.

### Application phases

`App.tsx` drives a linear phase progression:

```
splash → login_user → login_pass → booting → resume_prompt → playing → burned
```

Each phase controls what the input prompt does, whether input is masked, and which line sources are rendered. Boot credentials are hardcoded: `ghost` / `nX-2847`.

### State

All game state is a single `GameState` object (`src/types/game.ts`). It is cloned immutably via `src/engine/produce.ts` (a `structuredClone`-based helper — no Immer). State is auto-saved to `localStorage` after every mutation and restored on load.

### Command resolution pipeline (`src/engine/commands.ts`)

1. **Local commands** — `help`, `status`, `inventory`, `map`, `dossier`, `clear` — no trace cost, no state change
2. **Engine commands** — `scan`, `connect`, `login`, `ls`, `cat`, `disconnect`, `exploit`, `exfil`, `wipe-logs` — deterministic, return `CommandOutput` with optional `nextState`
3. **Unknown commands** — routed to Phase 3 AI (Groq via `/api/world-ai`)

`exploit` also asks the world AI route to narrate the outcome. If that call fails, or the API answers with its own offline fallback (`unavailable: true`, e.g. no AI key on a `vercel dev` server), a local module grants the service's access level, so a charge is never spent for nothing; only a real AI answer can deny access.

`resolveCommand(raw, state)` returns `{ lines, nextState }`. `App.tsx` applies `nextState` and appends `lines` to the session line buffer.

### Network / nodes

- **16 anchor nodes** are defined in `src/data/anchorNodes.ts` with hardcoded content, services, files, credentials, and connections.
- Nodes are organized in 6 layers (0=entry, 1=ops, 2=security, 3=finance, 4=executive, 5=aria).
- Phase 4 added procedural filler nodes around the anchors (seeded per run).
- `connect <ip>` needs a direct route, **or** a session you already hold on the target (`accessLevel !== 'none'`): holding one lets you pivot back to it from any node and layer, with no layer gating. Pivots set `previousNodeId` like any connect, so `disconnect` returns.
- `GameFile.content = null` means the file needs AI generation via `/api/file-content` (Phase 3).

### Terminal rendering

Lines are typed as `TerminalLine` (`src/types/terminal.ts`). Six `LineType` values map to CSS classes in `globals.css`: `output`, `input`, `system`, `error`, `separator`, `aria`. The `aria` type is reserved for the Aria AI character (Phase 6).

`TerminalInput` accepts `masked` (password fields) and `prompt` (custom prompt string) props. The suggestion bar fills the input on click or Tab.

### Tiled layout

The in-game screen is a tmux-style tiled workspace (`src/components/Workspace.tsx`, `src/layout/`). Five fixed panes — `term`, `files`, `doc`, `aux` (Map/Case tabs) and `comms` (a tabbed channel pane) — are positioned from a small split tree per preset (`hunt`, `analyze`, `watch`; `layoutTree.ts`). `LayoutRoot` renders all five panes as a stable keyed list (never nested), so zooming or switching presets never re-mounts the terminal and loses its input history. Dividers drag or nudge with arrow keys; ratios and the preset persist to their own `localStorage` key (`irongate_layout`, versioned, validated on load), separate from the game save — the same pattern as `engine/themes.ts`. Shortcuts (`useLayoutShortcuts`, matched on `KeyboardEvent.code`): `Alt+1…5` focus a pane, `Alt+Z` zoom, `Alt+P` cycle presets, `Esc` closes an overlay or leaves `comms`. Below 900px wide it collapses to one pane at a time with a tab strip. Help, Briefing and Dossier are centered overlays (`Overlay`), opened by their commands; `map`/`notes` select the aux tab and `explorer` focuses `files`. Before a game exists (login screens) the terminal is shown alone full-screen in the same keyed pane slot (`LayoutRoot` `bare` mode), so starting or ending a game never re-mounts it. Pending layout saves are also flushed on `pagehide` and unmount. The explorer is split into `FilesPane` (tree) and `DocPane` (viewer + Open/Exfil); every explorer action goes through `handleSubmit` as a normal command (full-path `cat` / `cat local:` / `exfil`), and a node file's content is shown only once it is in `GameState.filesRead`. COMMS starts with a NEXUS line (scripted, receive-only) and gets a SENTINEL tab at first contact: an interruption cuts into the Nexus line, then the tab takes over with its own focused input and a red pane frame (`data-alert`: border, title strip, trace bar, for as long as the channel is open); the red *palette* belongs to the Sentinel view only (`.comms-view[data-skin='alert']`, set by `CommsPane` for the SENTINEL tab and the first-contact interruption), so the NEXUS and ARIA tabs are drawn calm and Rhee's lines never look like Sentinel's; the terminal stays live behind it; `exit`/`quit` closes the channel and `msg sentinel` reopens it. Channel UI state is session-only (`sentinelOpen`, never derived from a saved `activeChannel`); Sentinel requests and state transitions live in `src/engine/sentinelChannel.ts`. The scripted Nexus line is pure derived state: `src/data/nexusMessages.ts` holds the authored messages (Rhee, signed O.R., never the secret name) and `src/engine/nexusLine.ts` latches each into `flags['NEXUS_MSG_<id>']` inside `withTurn` (triggers: `mission_start`, `trace_31/61/86`, `first_exfil`, `layer_3`, `layer_4`); `receivedNexusMessages(state)` is what the NEXUS tab shows, live and after a reload. Her replies are not terminal output: `cmdAriaAI` returns them as `CommandOutput.ariaReply` and the ARIA tab (labelled `CASSANDRA` until `ARIA_NAME_KNOWN`) is rebuilt from `state.aria.messageHistory` by `ariaChannelLines` (read-only; a favor offer's yes/no prompt stays in the terminal). `useUnread` marks the COMMS title and status bar (`5:comms!`) when something arrives while it is not focused; a resumed run starts read. The trace readout moved from the terminal header to `TraceMeter` along COMMS's top edge (the status bar repeats the number). The aux pane's second tab is **CASE**, the casebook (`src/components/CasePane.tsx`, replacing the old NOTES tab; `case` and `notes` both open it). `src/data/casebook.ts` holds authored people and facts: each fact has one subject, a source document and a verbatim `quote` that a test checks against the document. `buildCasebook` (`src/engine/casebook.ts`) derives PEOPLE (story cast plus employees whose credentials were obtained), TIMELINE, ACCOUNTS and the rest from `filesRead` and obtained credentials, so nothing is saved and a reload rebuilds it. Every known credential is listed once, under **KNOWN CREDENTIALS**, with its password and tagged with its owner (a story character, or an employee's name and role); a person's card only names the account and never repeats the password. A credential counts as soon as a document that shows it is read (`CASE_CREDENTIAL_SOURCES`, authored; the access level appears only once it is obtained), and the casebook never says where it works or was found. A source is a link into the explorer only when the file can be opened. Casebook text must never use the secret name or accuse anyone (guard tests). Design: `docs/superpowers/specs/2026-10-04-case-tab-design.md`. The tiled-UI design is `docs/superpowers/specs/2026-10-03-tiled-ui-design.md`. While you hold a session on the CCTV controller the aux pane also gets a **CAM** tab (`src/components/CamPane.tsx`), from any node: looping three.js footage with a camera pan, a cascading floor menu (`CamMenu`: floors in one column, the hovered or focused floor's cameras in a second column beside it, each floor with its accent swatch), a NIGHT VISION toggle (off by default, remembered) and a FULL SCREEN toggle (the aux pane's zoom). The menu lists **every** camera (ten, including `vault-door`, seen only from outside): ones the controller has not enabled are dimmed and marked locked and show a "FEED LOCKED" card, the executive ones show "FEED DISABLED — CEO OFFICE" until layer 4. Cameras have readable ids (`lobby-reception`, `server-aisle`, …) on floors, and a scene plus a mount (position, heading, pan) so one room can host two cameras; `cam_01`–`cam_03` survive as aliases because `camera_config.ini` and the incident report use them. `deepestLayer` (highest layer where you hold a session) against each feed's `unlockLayer` in `src/data/cameras.ts` decides which are live; a camera going live marks the aux pane unread. It is pure derived UI (`cameraFeeds` in `src/engine/cameras.ts`) with no saved state of its own (the one exception: `view-cam` sets `CAM_VIEWED_<id>` in the flags the first time a restricted executive camera is watched live, so its +1 trace is charged once per camera per run; the tab never charges), and three.js loads lazily from `src/components/cam/` (one builder per scene). Every room shares IronGate's look: white walls, a tiled floor, and one accent colour per floor (`FLOORS[].accent`, used by the trim, door frames, signs, the floor stripe and the menu swatch), lit by `litRoom` (soft fill plus one directional light: no point lights, which burn hot spots into white ceilings); tests check white `wall`s, accent `trim`, `grout` tiles, no point lights, steady lights (only the tagged `blink` LEDs and standby strips pulse), and that every room is closed all round (rays from each camera). `view-cam <id|alias>` reads the same feed data (a locked camera prints "FEED LOCKED"), so the terminal and the viewer cannot disagree; there is no AI call for camera feeds. Designs: `docs/superpowers/specs/2026-10-04-cctv-feeds-design.md`, `docs/superpowers/specs/2026-10-04-cctv-unlock-design.md`.

**Mail.** A **MAIL** aux tab (`src/components/MailPane.tsx`) plus the `mail`, `mail <name>` (name, id or login such as `j.mercer`) and `mail read <n>` commands, which print one line each and drive the pane (`WorkspaceHandle.showMail`; the pane's view is lifted to `Workspace`, and aux is focused only when off screen), intercepted in `App.tsx` like `map`/`case` (`src/engine/mailCommand.ts`, no trace cost). A mailbox unlocks per employee once their credential is known to the casebook (`knownCredentials`). The first open calls `/api/mail` once and stores the result in `GameState.mailboxes` (with `mailRead`: optional save fields, so no `SAVE_VERSION` bump). Authored mail from `src/data/mail.ts` always wins an id collision; `src/engine/mailFallback.ts` (deterministic) fills in when the API fails or answers `unavailable: true`. The route rejects output that names the mole or Nexus and scrubs the secret name. Guard tests: `src/data/__tests__/mailGuards.test.ts` and the mail case in `ariaNameWalk.test.ts`. Design: `docs/superpowers/specs/2026-10-09-mail-design.md`.

### Naming rule (the secret name)

The player never sees the name "Aria" until the flag `ARIA_NAME_KNOWN` is set (`src/engine/ariaName.ts`). It flips when the board vote (`PROJ_SENTINEL_BOARD_VOTE.pdf`) is read via `cat` or `cat local:`, or on the first connect to a layer-5 node; exfiltrating the key does not set it. Until then all player-visible text uses the cover name **CASSANDRA** (authored data, tool name `Restricted Subnet Key`, layer-5 labels, services). The vote file is the one authored document outside layer 5 that bridges both names. Help, the dossier heading and the `msg` usage line are gated on the flag; internal identifiers (`aria_*` node ids, `state.aria`, `ariaPlanted`) keep their names. Saves written before the rename are migrated on load (`src/engine/saveMigration.ts`). The AI handlers follow the same rule: every request carries `ariaNameKnown` (a required boolean, validated in `api/_lib/validate.ts`); while it is `false` each prompt forbids the name and the returned text is scrubbed (`api/_lib/ariaName.ts`), and the world AI's `flagsSet` can never set the protected flag. Aria's own handler is the one exception: she introduces herself, and her reply sets the flag when it actually contains her name. Guard tests: `src/data/__tests__/ariaNameLeak.test.ts` and `src/engine/__tests__/ariaNameWalk.test.ts` — extend them when adding pre-reveal text.

### Lore documents

The mole and Sentinel trail (reset log, cast documents, Cho decoy, the rewritten NOTE_01) is authored in `src/data/anchorNodes.ts` and specified in `docs/superpowers/specs/2026-10-03-lore-pass-design.md`. `src/data/__tests__/lorePass.test.ts` pins each document's node, path, access level and the cross-document dates and amounts — update it with the outline when editing them. `access_log` and `badge_log_nov.csv` are authored now, no longer AI-generated; `access_log` stays admin-only and non-exfiltrable.

### Knowledge tiers (Aria and Sentinel)

`src/engine/aiTiers.ts` computes a 0–3 tier per character from `GameState` (`ariaTier`: trust, `BOARD_KNEW`, and `NOTE_REVEALED` for tier 3; `sentinelTier`: trace, layer 5, `ARIA_NAME_KNOWN`, `NOTE_REVEALED`). The client sends it as `tier`; `api/_lib/tiers.ts` (`parseTier`: invalid → 0) builds each handler's prompt as persona → ALLOWED → FORBIDDEN → output contract. Knowledge above the current tier never appears in the prompt. `NOTE_REVEALED` (`src/engine/noteReveal.ts`) is set by `cat` of `/aria/core/self_model.txt` on `aria_core`; it fires a one-time `note_revealed` Sentinel trigger, makes Aria tier 3, adds an authored epilogue (`src/engine/epilogue.ts`, `src/data/epilogues.ts`) to the endings and a readout line. Design: `docs/superpowers/specs/2026-10-03-the-reveal-design.md`. Design: `docs/superpowers/specs/2026-10-03-ai-knowledge-tiers-design.md`; the story bible §9 is the source for the tier text.

### Styling

Pure CSS, no framework. A circuit-board photo (`--desktop-photo`) is the backdrop everywhere: heavily tinted behind the pre-game screens, and visible through translucent, blurred panes in the tiled UI (`--glass`, `--glass-chrome`; the Help/Briefing/Dossier overlays stay opaque). The welcome and prologue screens share one smaller text size (`PRE_GAME_FONT_SIZE`). `src/styles/globals.css` uses CSS custom properties for the color palette. The aesthetic is DOS/ncurses: `#0000aa` background, IBM Plex Mono font (loaded via `@fontsource/ibm-plex-mono`, imported in `main.tsx`), white/gray text. No glow or CRT effects are active (the `body.crt` class was removed).

## Implemented phases

- **Phase 3** — AI Loop: `/api/world-ai`, `/api/file-content`, `/api/aria` Vercel serverless functions. Keys in `.env.local` as `GROQ_API_KEY` and `GEMINI_API_KEY`.
- **Phase 4** — Procedural Nodes: filler node generator seeded per run, employee pool, division seeds, connectivity builder, credential chain guarantee.
- **Phase 5** — Trace/Sentinel: trace meter, thresholds (31/61/86/100%), exploit command & layer gating, Sentinel system.

## Planned additions (do not implement speculatively)

- **Phase 6**: Aria subnetwork dialogue with trust score (partially open — issue #18).
- **Phase 7**: Four endings (LEAK / SELL / DESTROY / FREE).
- **Phases 8–10**: TBD.
