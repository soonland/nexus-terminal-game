# Copilot Instructions

## Project overview

Nexus Terminal Game is a **client-side browser game** built with React + TypeScript + Vite. It is a retro DOS/ncurses-style terminal hacking game where the player navigates a fictional corporate network. Most logic runs in the browser; serverless API routes exist under `/api` for AI-assisted features (node descriptions, file content, world AI).

## Stack

- **React 18** with TypeScript (`strict` mode)
- **Vite** for bundling
- **Vitest** for unit tests (75% coverage threshold per file)
- **Pure CSS** — no CSS framework (no Tailwind, no MUI, no styled-components)
- **MSW** for API mocking in tests

## Code conventions

- Arrow functions only (`func-style` ESLint rule — no `function` declarations)
- Semicolons required
- Single quotes, trailing commas, 100-char line width (Prettier)
- No `console.log` in `src/` — use `console.warn` at most
- Commits must follow Conventional Commits: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `ci`, `build`, `perf`, `revert`

## Architecture

### State machine

`App.tsx` drives a linear phase progression:

```
splash → login_user → login_pass → booting → resume_prompt → playing → burned
```

### Game state

- Single `GameState` object defined in `src/types/game.ts`
- Mutated immutably via `src/engine/produce.ts` (`structuredClone`-based — no Immer)
- Auto-saved to `localStorage` after every mutation

### Command resolution (`src/engine/commands.ts`)

`resolveCommand(raw, state)` returns `{ lines, nextState }`:

1. **Local commands** (`help`, `status`, `inventory`, `map`, `clear`) — read-only, no state change
2. **Engine commands** (`scan`, `connect`, `login`, `ls`, `cat`, `disconnect`, `exploit`, `exfil`, `wipe-logs`) — deterministic, return optional `nextState`
3. **Unknown commands** — reserved for Phase 3 AI routing

### Network nodes

- 16 anchor nodes in `src/data/anchorNodes.ts` — hardcoded content, credentials, connections
- 6 layers: 0=entry, 1=ops, 2=security, 3=finance, 4=executive, 5=aria
- `GameFile.content = null` means AI-generated content (stub until Phase 3)

### Terminal rendering

- Lines typed as `TerminalLine` (`src/types/terminal.ts`)
- Six `LineType` values: `output`, `input`, `system`, `error`, `separator`, `aria`
- CSS classes live in `src/styles/globals.css`
- `aria` type reserved for the Aria AI character (Phase 6)

### Styling

- `src/styles/globals.css` with CSS custom properties
- DOS/ncurses aesthetic: `#0000aa` background, IBM VGA 8x16 font (self-hosted in `public/fonts/`)
- Do not add glow, CRT, or animation effects unless explicitly requested

## Testing

- Framework: Vitest + Testing Library
- 75% minimum coverage (statements, branches, functions, lines) per file
- MSW handlers in `src/mocks/` for the 3 Phase 3 API routes — use realistic fixtures
- Do not mock internal modules; prefer real implementations

## What NOT to do

- Do not add CSS frameworks, UI component libraries, or animation libraries
- Do not add Immer or other state management libraries
- Do not speculatively implement Phase 3–7 features (AI proxying, procedural nodes, Sentinel, Aria dialogue, endings)
- Do not add `console.log` — only `console.warn` is permitted in `src/`
- Do not use `function` keyword for declarations — use arrow functions
- Do not add error handling or validation for scenarios that cannot happen
- Do not create helpers or abstractions for one-time use

## Planned phases (do not implement ahead of time)

- **Phase 6**: Aria subnetwork dialogue with trust score
- **Phase 7**: Four endings — LEAK / SELL / DESTROY / FREE

> Phases 3–5 are already implemented. The `/api` routes, procedural filler nodes, trace thresholds, and Sentinel system are all active. Do not rewrite or duplicate them — extend only when explicitly requested.
