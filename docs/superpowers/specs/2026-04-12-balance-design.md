# Balance Design — Phase 5/6 Holistic Pass

**Date:** 2026-04-12
**Status:** Approved
**Scope:** Trace threshold, file unlock mini-game, charge budget

---

## Problem Statement

The current balance is too punishing for a first-time player who plays carefully:

1. **31% locking threshold** fires before a player can reasonably avoid it — `exploit proprietary` alone adds 4 trace, pushing past 31% in a single command with no warning.
2. **File locks are permanent** — once triggered, critical-path files (e.g., `project_aria_summary.txt`) are inaccessible for the rest of the run with no recovery path.
3. **3 starting charges** is exactly the critical-path minimum, leaving zero headroom for Fork 1 Path B (WB WORKSTATION: +1 charge) or any side exploit.

**Design intent:** A careful first-time player who reads output and avoids tripwires should be able to complete the run without prior knowledge of trace costs.

---

## Changes

### 1 — Threshold adjustment

The file-locking `onCross` side-effect moves from **31% → 55%**.

- At 55%, a player avoiding tripwires and failed logins can traverse all six layers without triggering it.
- The 31% alert message ("Watchlist active") **stays** as an early warning with no game-state consequence.
- The 61% alert message is unchanged.
- The locking behaviour itself is identical: up to 2 non-tripwire files locked per already-compromised node, fires once on first crossing only.

**Change location:** `THRESHOLD_ALERT_META` in `src/engine/commands.ts` — move the `onCross` handler from the `31` key to a new `55` key, and add `55` to `TRACE_THRESHOLDS` in `src/engine/state.ts`.

---

### 2 — `unlock` command

New engine command that lets the player bypass a file lock via a 3-step confirmation mini-game.

#### Trigger

`unlock [filename]` — explicit, player-initiated.

`cat` on a locked file continues to show:
```
// ACCESS DENIED: filename — secured by watchlist protocol
// (run unlock filename to attempt bypass)
```

#### Mini-game flow

1. Engine generates 3 independent random 8-character alphanumeric codes (format: `XXXX-XXXX`, e.g., `A4K9-XR2M`).
2. Terminal displays step 1: `Unlock [1/3] — enter code: A4K9-XR2M`
3. Player types the code and submits.
4. Correct → advance to step 2 with a new code displayed.
5. **Any of the following counts as a failure and increments the failure counter:**
   - Mistyped code at any step
   - Running any other command mid-sequence (abandonment)
   - Disconnecting mid-sequence
6. On failure: sequence restarts from step 1 with 3 fresh codes generated. Terminal prints: `Unlock sequence interrupted — attempt [N/3] recorded.` (or `Wrong code — attempt [N/3] recorded.`)
7. **After 3 cumulative failures** (individual misfires, not full-sequence failures): file is permanently re-locked. `unlock` returns a hard error: `unlock: bypass limit reached — file hardened`. No further attempts possible.

#### Success

Completing all 3 steps correctly:
- File `locked` flag set to `false`
- `+5 trace`
- `-1 charge`
- Terminal prints: `Bypass confirmed. File access restored.`

#### State

Add to `GameState`:
```ts
unlockAttempts: Record<string, number>; // keyed by file.path, counts cumulative individual failures
```

`unlockAttempts` must be persisted in `persistence.ts` alongside other player-state deltas. On successful unlock, the file's path is removed from `lockedFilePaths` in the node's save delta so the unlock survives reload.

#### Active channel integration

The 3-step sequence uses `activeChannel` (already on `GameState`) to carry unlock context between turns:
```ts
type UnlockChannel = {
  type: 'unlock';
  filePath: string;
  codes: [string, string, string]; // pre-generated for all 3 steps
  step: 0 | 1 | 2; // current step index
};
```
`App.tsx` checks `activeChannel.type === 'unlock'` before routing input to `resolveCommand`. When active, raw input is passed directly to a `resolveUnlockStep` handler instead of the command pipeline. Any other command typed while the channel is active (detected via the absence of `activeChannel` being cleared before submission) is treated as abandonment — the channel is cleared, counter increments, and the command is executed normally.

#### Code generation

Pure function `generateUnlockCode(): string` — returns an 8-char alphanumeric string formatted as `XXXX-XXXX`. Seeded from `Math.random()` (no game seed needed — codes are ephemeral).

---

### 3 — Charge budget

Starting charges increase from **3 → 4** for the default loadout.

| Scenario | Charges used | Remaining |
|---|---|---|
| Critical path only | 3 | 1 |
| Critical path + Fork 1 Path B | 4 | 0 |
| Critical path + one unlock | 4 | 0 |
| Critical path + Fork 1 Path B + one unlock | 5 | — (not enough) |

The extra charge covers exactly one optional action. Players cannot do both Fork 1 Path B and an unlock without finding additional charges — a meaningful trade-off.

**Contract loadouts:**

| Contract | Current | New |
|---|---|---|
| Default (no contract) | 3 | 4 |
| `ghost_protocol` | 2 | 2 (unchanged — charge pressure is intentional) |
| Exfil-heavy contracts | 5 | 5 (unchanged) |

**Change location:** `startingCharges` default in `src/engine/state.ts`.

---

## Testing Plan

### `unlock` command unit tests (`src/engine/commands.test.ts`)

- Happy path: 3 correct codes → file unlocked, `+5 trace`, `-1 charge`
- Mistype on step 1 → counter increments to 1, sequence restarts with fresh codes
- Mistype on step 2 → counter increments, sequence restarts
- 3 cumulative misfires → file permanently re-locked, hard error on further `unlock`
- Abandonment (other command mid-sequence) → counter increments
- `unlock` on non-locked file → clear error (`filename: not locked`)
- `unlock` on already-unlocked file → no-op or clear message
- `unlock` with no argument → usage error

### Threshold regression (`src/engine/commands.test.ts`)

- Assert no files locked when trace crosses 31%
- Assert files locked when trace crosses 55%
- Assert 31% alert message still fires (no game-state side-effect)
- Assert 55% alert message fires on first crossing only

### Charge budget

- Update any test fixtures asserting `player.charges === 3` at game start to `=== 4`
- `ghost_protocol` contract fixture: assert charges start at 2 (unchanged)

---

## Out of Scope

- Trace cost adjustments per exploit (deferred to Phase 7 when full run length is known)
- `wipe-logs` unlocking files (superseded by the unlock mechanic)
- Randomised unlock difficulty scaling with trust score or layer depth
