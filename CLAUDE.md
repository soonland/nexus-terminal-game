# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # start Vite dev server at localhost:5173
npm run build         # tsc type check + Vite production build
npm run lint          # ESLint (all files)
npm run format        # Prettier write (all files)
npm run preview       # preview production build locally
npm run test          # Vitest run (all tests)
npm run test:coverage # Vitest with v8 coverage (≥75% per file)
npm run test:ui       # Vitest browser UI
npm run analyze       # production build + open bundle treemap
npm run knip          # find unused exports, files, and dependencies
```

Build (`npm run build`) is the primary correctness check — it runs `tsc -b` before Vite, so TypeScript errors will fail the build.

## Tooling

- **ESLint** — `eslint.config.js`, `strictTypeChecked` ruleset, uses `tsconfig.eslint.json` (covers all files in one block). Arrow functions enforced (`func-style`), semicolons required, `no-console` warns in `src/`.
- **Prettier** — `.prettierrc.json`: single quotes, trailing commas, 100 char width, no arrow parens, bracket same line.
- **Husky + lint-staged** — pre-commit runs Prettier then ESLint on staged files only. `commit-msg` runs commitlint.
- **commitlint** — `commitlint.config.js`, enforces Conventional Commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, `revert`).
- **Knip** — `knip.json`, detects unused exports/files/dependencies. Run before PRs touching exports or deps.
- **MSW** — `src/mocks/` has Node server + handlers pre-wired for the 3 Phase 3 API routes. Setup file is registered in `vitest.config.ts`. Add realistic fixtures when implementing Phase 3.
- **Dependabot** — `.github/dependabot.yml`, weekly minor/major npm updates, grouped PRs, `chore(deps):` commit prefix.
- **release-please** — `.github/workflows/release-please.yml`, opens a release PR on every merge to `main` with auto-generated changelog from conventional commits.

## Architecture

The game is a **client-side state machine**. There is no backend yet (Phase 3 will add Vercel serverless functions for AI proxying). All game logic runs in the browser.

### Application phases

`App.tsx` drives a linear phase progression:

```
splash → login_user → login_pass → booting → resume_prompt → playing → burned
```

Each phase controls what the input prompt does, whether input is masked, and which line sources are rendered. Boot credentials are hardcoded: `ghost` / `nX-2847`.

### State

All game state is a single `GameState` object (`src/types/game.ts`). It is cloned immutably via `src/engine/produce.ts` (a `structuredClone`-based helper — no Immer). State is auto-saved to `localStorage` after every mutation and restored on load.

### Command resolution pipeline (`src/engine/commands.ts`)

1. **Local commands** — `help`, `status`, `inventory`, `map`, `clear` — no trace cost, no state change
2. **Engine commands** — `scan`, `connect`, `login`, `ls`, `cat`, `disconnect`, `exploit`, `exfil`, `wipe-logs` — deterministic, return `CommandOutput` with optional `nextState`
3. **Unknown commands** — stub for Phase 3 AI routing (Groq)

`resolveCommand(raw, state)` returns `{ lines, nextState }`. `App.tsx` applies `nextState` and appends `lines` to the session line buffer.

### Network / nodes

- **16 anchor nodes** are defined in `src/data/anchorNodes.ts` with hardcoded content, services, files, credentials, and connections.
- Nodes are organized in 6 layers (0=entry, 1=ops, 2=security, 3=finance, 4=executive, 5=aria).
- Phase 4 will add procedural filler nodes around the anchors.
- `GameFile.content = null` means the file needs AI generation (Phase 3). The `cat` command currently shows a stub for these.

### Terminal rendering

Lines are typed as `TerminalLine` (`src/types/terminal.ts`). Six `LineType` values map to CSS classes in `globals.css`: `output`, `input`, `system`, `error`, `separator`, `aria`. The `aria` type is reserved for the Aria AI character (Phase 6).

`TerminalInput` accepts `masked` (password fields) and `prompt` (custom prompt string) props. The suggestion bar fills the input on click or Tab.

### Styling

Pure CSS, no framework. `src/styles/globals.css` uses CSS custom properties for the color palette. The aesthetic is DOS/ncurses: `#0000aa` background, IBM VGA 8x16 font (self-hosted in `public/fonts/`), white/gray text. No glow or CRT effects are active (the `body.crt` class was removed).

## Planned additions (do not implement speculatively)

- **Phase 3**: `/api/world-ai`, `/api/file-content`, `/api/aria` Vercel serverless functions. Keys go in `.env.local` as `GROQ_API_KEY` and `GEMINI_API_KEY`.
- **Phase 4**: Procedural filler node generator seeded per run.
- **Phase 5**: Trace thresholds (31/61/86/100%), Sentinel system.
- **Phase 6**: Aria subnetwork dialogue with trust score.
- **Phase 7**: Four endings (LEAK / SELL / DESTROY / FREE).
