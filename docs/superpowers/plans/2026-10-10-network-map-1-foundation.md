# Network map, part 1: foundation (no UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the game what the node menu needs and nothing visible yet: a saved list of scanned nodes, shared command rules the menu can reuse, and a pure `nodeActions(state, nodeId)` that says what a click on a node may do, with its cost.

**Architecture:** `GameState.scanned` (optional save field) is set by `scan <ip>`. Three small rule helpers (`connectBlockedMessage`, `exploitChargeCost`, `scanTraceRange`) move out of `cmdConnect`, `cmdExploit` and `cmdScan` into exported functions that both the commands and the menu use. `src/engine/mapActions.ts` composes them into `nodeActions`. A contract test runs every enabled action's command through `resolveCommand` to prove the menu cannot drift from the engine.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-network-map-design.md` (this is part 1 of its four PRs; parts 2 to 4 get their own plans, written against the code this part leaves behind).

## Global Constraints

- Arrow functions only (`func-style`), semicolons, single quotes, trailing commas, 100-char width; no `console.*` in `src/`.
- Gate before every commit, in this order: `pnpm format`, `pnpm build`, `pnpm lint`, `pnpm test`; before the PR also `pnpm test:coverage` (75% per file) and `pnpm knip`. knip already reports 13 unused-type findings and one configuration hint; this work must add none (do not `export` a type or function that nothing imports). Commit messages are Conventional Commits with lowercase subjects and end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- The save format is delta-based (`SAVE_VERSION = 6`; a mismatch **discards** the save). New save fields are **optional**, with no version bump, like `filesRead?`, `unlockAttempts?`, `mailboxes?`.
- No new game rules and no change to any command's output or behaviour. The refactors in Task 2 must leave every existing test green untouched.
- Naming rule: nothing player-visible may contain "Aria" before the reveal. (This part adds no new authored text; the menu texts below contain none.)
- Tests that call `resolveCommand` stub `fetch` with `vi.stubGlobal('fetch', ...)` (see `src/engine/commands.test.ts`); never rely on a relative-URL fetch in the node test environment.
- Facts verified against the code (use these ids and values): the game starts at `contractor_portal` (`10.0.0.1`, layer 0, connects to `vpn_gateway`); `vpn_gateway` is `10.0.0.2` (layer 0, connects to `contractor_portal`, `ops_cctv_ctrl`, `ops_hr_db`) and is the layer-0 key anchor (`LAYER_KEY_ANCHOR[0]`); `ops_cctv_ctrl` is `10.1.0.1` and `ops_hr_db` is `10.1.0.2` (layer 1). Default starting tools are `port-scanner` and `exploit-kit`, with 4 charges. `connect` does **not** check `locked`; it checks discovered, same node, a direct route or a held session (pivot), and layer gating through the key anchor.

## Review Focus

- At the decision terminal (`aria_decision`) and when the phase is not `playing`, the menu must offer nothing (the engine rejects all input there except `1` to `4`).
- A credential that grants no more access than the player already has on the node, a revoked one, and one not yet obtained are never offered, and the password appears only inside the command string.
- Exploit entries never appear for a node the player has not scanned (no leak of vulnerabilities), and never list a patched or non-vulnerable service.
- Bare `scan`, a `scan` of an unknown IP, and re-scanning a host must not add or duplicate `scanned` entries; a save from before this change loads with `[]`.
- Every enabled action's command, run on the same state, must not fail a precondition (usage, not found, no route, insufficient charges, tool missing or depleted).

---

### Task 1: `scanned` state and `scan <ip>` marks it

**Files:**
- Modify: `src/types/game.ts` (`GameState`), `src/engine/state.ts` (`createInitialState`), `src/engine/persistence.ts` (`SaveState`, `toSaveState`, `fromSaveState`), `src/engine/__tests__/testHelpers.ts` (`makeState`), `src/engine/commands.ts` (`cmdScan`), `docs/superpowers/specs/2026-10-10-network-map-design.md`
- Test: `src/engine/persistence.test.ts` (append), `src/engine/commands.test.ts` (append)

**Interfaces:**
- Produces: `GameState.scanned: string[]` (node ids scanned by IP); optional `SaveState.scanned?: string[]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/persistence.test.ts` (it already has `makeMockStorage`, `saveGame`, `loadGame`, `createInitialState`, `produce`):

```ts
describe('persistence — scanned', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips the scanned list', () => {
    const state = produce(createInitialState(), s => {
      s.scanned = ['vpn_gateway', 'ops_hr_db'];
    });
    saveGame(state);
    const [, value] = mockStorage.setItem.mock.calls[0];
    mockStorage.getItem.mockReturnValue(value);
    expect(loadGame()?.scanned).toEqual(['vpn_gateway', 'ops_hr_db']);
  });

  it('defaults to [] when an older save has no scanned field', () => {
    saveGame(createInitialState());
    const [, value] = mockStorage.setItem.mock.calls[0];
    const save = JSON.parse(value) as Record<string, unknown>;
    delete save['scanned'];
    mockStorage.getItem.mockReturnValue(JSON.stringify(save));
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.scanned).toEqual([]);
  });

  it('omits the field from the save while nothing is scanned', () => {
    saveGame(createInitialState());
    const [, value] = mockStorage.setItem.mock.calls[0];
    expect('scanned' in (JSON.parse(value) as Record<string, unknown>)).toBe(false);
  });
});
```

Append to `src/engine/commands.test.ts` (it already imports `describe, it, expect, vi, beforeEach, afterEach`, `resolveCommand`, `createInitialState`):

```ts
describe('scan <ip> records the scanned hosts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks the host after scan <ip>', async () => {
    const result = await resolveCommand('scan 10.0.0.2', createInitialState());
    expect(result.nextState?.scanned).toEqual(['vpn_gateway']);
  });

  it('does not add a host twice', async () => {
    const first = await resolveCommand('scan 10.0.0.2', createInitialState());
    const second = await resolveCommand('scan 10.0.0.2', first.nextState ?? createInitialState());
    expect(second.nextState?.scanned).toEqual(['vpn_gateway']);
  });

  it('a bare scan marks nothing (it lists peers only)', async () => {
    const state = createInitialState();
    const result = await resolveCommand('scan', state);
    expect((result.nextState ?? state).scanned).toEqual([]);
  });

  it('an unknown IP marks nothing', async () => {
    const state = createInitialState();
    const result = await resolveCommand('scan 9.9.9.9', state);
    expect((result.nextState ?? state).scanned).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/engine/persistence.test.ts src/engine/commands.test.ts -t "scan"`
Expected: FAIL (TypeScript or `undefined` for `scanned`).

- [ ] **Step 3: Add the field**

In `src/types/game.ts`, in `GameState` after `mailRead`:

```ts
  scanned: string[]; // ids of nodes the player has scanned by IP (`scan <ip>`); the map menu lists services only for these
```

In `src/engine/state.ts` add `scanned: [],` after `mailRead: [],` in the returned state. In `src/engine/__tests__/testHelpers.ts` add `scanned: [],` after `mailRead: [],` inside `makeState`. Run `pnpm build`: if another test file builds a full `GameState` literal (for example `src/engine/__tests__/commands.decision.test.ts`), add `scanned: []` after its `mailRead: []`.

In `src/engine/persistence.ts`: add to `SaveState`, after `mailRead?`:

```ts
  scanned?: string[]; // optional for backwards compat: no SAVE_VERSION bump
```

in `toSaveState`, after the `mailRead` spread:

```ts
    ...(state.scanned.length > 0 && { scanned: state.scanned }),
```

in `fromSaveState`, after `state.mailRead = save.mailRead ?? [];`:

```ts
  state.scanned = save.scanned ?? [];
```

- [ ] **Step 4: Make `scan <ip>` record the host**

In `src/engine/commands.ts`, in `cmdScan`, inside `if (args[0]) { ... }`, directly after the block that sets `n.discovered = true` for an undiscovered target and before `lines.push(out(\`Scanning ${target.ip}...\`));`, add:

```ts
    if (!next.scanned.includes(target.id)) {
      next = produce(next, s => {
        s.scanned.push(target.id);
      });
    }
```

- [ ] **Step 5: Correct the spec**

In `docs/superpowers/specs/2026-10-10-network-map-design.md`, in "The node menu" replace `Otherwise disabled with the reason ("no route from here", "locked").` with `Otherwise disabled with the exact message the command would print ("No direct route from ... to ...", "ACCESS DENIED — current layer incomplete — gain a foothold on ... first"). \`connect\` does not check \`locked\`, so locked is not a reason.` Also add one bullet to the same section: `At the decision terminal (aria_decision), and whenever the game phase is not playing, the menu offers nothing: the engine rejects all input there except 1 to 4.`

- [ ] **Step 6: Run tests and the type check**

Run: `pnpm test src/engine/persistence.test.ts src/engine/commands.test.ts && pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
pnpm format && git add -A && git commit -m "feat: remember which hosts the player has scanned

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: shared command rules

**Files:**
- Modify: `src/engine/commands.ts` (`cmdConnect`, `cmdExploit`, `cmdScan`; three new exports)
- Test: `src/engine/commandRules.test.ts` (create)

**Interfaces:**
- Produces:
  - `connectBlockedMessage(state: GameState, target: LiveNode): string | null`: the exact error message `connect` would print for that target from the current node, or `null` when the connect would go ahead.
  - `exploitChargeCost(node: LiveNode, svc: Service): number`: `svc.exploitCost`, plus 1 when `node.sentinelPatched`.
  - `scanTraceRange(state: GameState): { min: number; max: number }`: `{ 0, 0 }` while an unused `port-scanner` is held, otherwise `{ 1, 2 }`.

- [ ] **Step 1: Write the failing tests**

Create `src/engine/commandRules.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { connectBlockedMessage, exploitChargeCost, resolveCommand, scanTraceRange } from './commands';
import { createInitialState } from './state';
import produce from './produce';
import type { GameState, LiveNode, Service } from '../types/game';

const node = (s: GameState, id: string): LiveNode => {
  const n = s.network.nodes[id];
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

const at = (id: string, edit: (s: GameState) => void = () => undefined): GameState =>
  produce(createInitialState(), s => {
    s.network.currentNodeId = id;
    edit(s);
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connectBlockedMessage', () => {
  it('refuses a node that is not discovered', () => {
    const s = at('contractor_portal', st => {
      node(st, 'vpn_gateway').discovered = false;
    });
    expect(connectBlockedMessage(s, node(s, 'vpn_gateway'))).toBe(
      'No route to 10.0.0.2 — try scanning first',
    );
  });

  it('refuses the node the player is on', () => {
    const s = at('contractor_portal');
    expect(connectBlockedMessage(s, node(s, 'contractor_portal'))).toBe(
      'Already connected to 10.0.0.1',
    );
  });

  it('refuses a discovered node with no link and no session', () => {
    const s = at('contractor_portal', st => {
      node(st, 'ops_hr_db').discovered = true;
    });
    expect(connectBlockedMessage(s, node(s, 'ops_hr_db'))).toBe(
      'No direct route from 10.0.0.1 to 10.1.0.2',
    );
  });

  it('allows a linked node on the same layer', () => {
    const s = at('contractor_portal', st => {
      node(st, 'vpn_gateway').discovered = true;
    });
    expect(connectBlockedMessage(s, node(s, 'vpn_gateway'))).toBeNull();
  });

  it('allows a pivot to a node the player holds a session on', () => {
    const s = at('contractor_portal', st => {
      node(st, 'ops_hr_db').discovered = true;
      node(st, 'ops_hr_db').accessLevel = 'user';
    });
    expect(connectBlockedMessage(s, node(s, 'ops_hr_db'))).toBeNull();
  });

  it('blocks crossing a layer until the key anchor is compromised', () => {
    const s = at('vpn_gateway', st => {
      node(st, 'ops_cctv_ctrl').discovered = true;
    });
    expect(connectBlockedMessage(s, node(s, 'ops_cctv_ctrl'))).toBe(
      '// ACCESS DENIED — current layer incomplete — gain a foothold on 10.0.0.2 first',
    );
    const open = produce(s, st => {
      node(st, 'vpn_gateway').compromised = true;
    });
    expect(connectBlockedMessage(open, node(open, 'ops_cctv_ctrl'))).toBeNull();
  });

  it('is exactly what the connect command prints', async () => {
    const s = at('contractor_portal', st => {
      node(st, 'ops_hr_db').discovered = true;
    });
    const result = await resolveCommand('connect 10.1.0.2', s);
    expect(result.lines.map(l => l.content)).toContain(
      connectBlockedMessage(s, node(s, 'ops_hr_db')),
    );
  });
});

describe('exploitChargeCost', () => {
  const svc: Service = {
    name: 'http',
    port: 80,
    vulnerable: true,
    exploitCost: 2,
    accessGained: 'user',
  };

  it('is the service cost on an ordinary node', () => {
    const s = at('contractor_portal');
    expect(exploitChargeCost(node(s, 'contractor_portal'), svc)).toBe(2);
  });

  it('costs one more on a node Sentinel has patched', () => {
    const s = at('contractor_portal', st => {
      node(st, 'contractor_portal').sentinelPatched = true;
    });
    expect(exploitChargeCost(node(s, 'contractor_portal'), svc)).toBe(3);
  });
});

describe('scanTraceRange', () => {
  it('is free while an unused port scanner is held', () => {
    expect(scanTraceRange(createInitialState())).toEqual({ min: 0, max: 0 });
  });

  it('is 1 to 2 once the scanner is used up', () => {
    const s = produce(createInitialState(), st => {
      for (const t of st.player.tools) if (t.id === 'port-scanner') t.used = true;
    });
    expect(scanTraceRange(s)).toEqual({ min: 1, max: 2 });
  });

  it('is 1 to 2 without a scanner at all', () => {
    const s = produce(createInitialState(), st => {
      st.player.tools = st.player.tools.filter(t => t.id !== 'port-scanner');
    });
    expect(scanTraceRange(s)).toEqual({ min: 1, max: 2 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/engine/commandRules.test.ts`
Expected: FAIL (the three functions are not exported yet).

- [ ] **Step 3: Add the helpers and use them in the commands**

In `src/engine/commands.ts`, ensure `LiveNode` and `Service` are imported as types from `../types/game` (add them to the existing type import if missing). Above `cmdScan`, add:

```ts
// The trace a scan costs: free while an unused port scanner is held, otherwise 1 or 2.
export const scanTraceRange = (state: GameState): { min: number; max: number } =>
  state.player.tools.some(t => t.id === 'port-scanner' && !t.used)
    ? { min: 0, max: 0 }
    : { min: 1, max: 2 };
```

In `cmdScan` replace

```ts
  const hasPortScanner = state.player.tools.some(t => t.id === 'port-scanner' && !t.used);
  const traceDelta = hasPortScanner ? 0 : Math.random() < 0.5 ? 1 : 2;
```

with

```ts
  const range = scanTraceRange(state);
  const traceDelta = range.max === 0 ? 0 : Math.random() < 0.5 ? range.min : range.max;
```

(The behaviour is identical: 0 with a scanner, otherwise 1 or 2.)

Above `cmdConnect`, add (this is the checks of `cmdConnect` moved verbatim, returning the message instead of an `err` line):

```ts
// Why `connect` to this node is refused from where the player stands, as the exact message the
// command prints; null when it would go ahead. The map's node menu uses it too, so the two
// cannot disagree.
export const connectBlockedMessage = (state: GameState, target: LiveNode): string | null => {
  if (!target.discovered) return `No route to ${target.ip} — try scanning first`;
  const node = currentNode(state);
  if (target.id === node.id) return `Already connected to ${target.ip}`;
  // A node you already hold a session on can be re-entered from anywhere (a pivot): no link and
  // no layer gating needed. Everything else needs a direct route.
  const linked = node.connections.includes(target.id);
  const pivot = !linked && target.accessLevel !== 'none';
  if (!linked && !pivot) return `No direct route from ${node.ip} to ${target.ip}`;
  // Layer gating: cross-layer connect blocked unless current layer's key anchor is compromised.
  if (linked && target.layer > node.layer) {
    const keyAnchorId = LAYER_KEY_ANCHOR[node.layer];
    if (keyAnchorId) {
      const keyAnchor = state.network.nodes[keyAnchorId];
      if (!keyAnchor?.compromised) {
        const hint = keyAnchor ? ` — gain a foothold on ${keyAnchor.ip} first` : '';
        return `// ACCESS DENIED — current layer incomplete${hint}`;
      }
    }
  }
  return null;
};
```

In `cmdConnect`, replace everything from `if (!target.discovered) return ...` through the end of the layer-gating `if (linked && target.layer > node.layer) { ... }` block with:

```ts
  const blocked = connectBlockedMessage(state, target);
  if (blocked) return { lines: [err(blocked)] };
```

keeping `const target = ...`, the `Host not found` line before it, and everything after the gating block unchanged. If the code after the block uses `node` (the current node), keep a `const node = currentNode(state);` line after the new check.

Above `cmdExploit`, add:

```ts
// Charges one exploit of this service costs: sentinelPatched nodes cost one more.
export const exploitChargeCost = (node: LiveNode, svc: Service): number =>
  svc.exploitCost + (node.sentinelPatched ? 1 : 0);
```

In `cmdExploit` replace `const effectiveCost = svc.exploitCost + (node.sentinelPatched ? 1 : 0);` with `const effectiveCost = exploitChargeCost(node, svc);` (keep the comment line above it).

- [ ] **Step 4: Run the new tests and the whole engine suite**

Run: `pnpm test src/engine && pnpm build`
Expected: PASS, with every pre-existing test unchanged and green.

- [ ] **Step 5: Commit**

```bash
pnpm format && git add -A && git commit -m "refactor: share the connect, exploit and scan rules so the map menu can reuse them

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `nodeActions`

**Files:**
- Create: `src/engine/mapActions.ts`
- Test: `src/engine/mapActions.test.ts`, `src/engine/__tests__/mapActions.contract.test.ts` (create both)
- Modify: `CLAUDE.md` (one paragraph)

**Interfaces:**
- Consumes: `connectBlockedMessage`, `exploitChargeCost`, `scanTraceRange` (Task 2); `GameState.scanned` (Task 1); `hasAccess` (`src/types/game.ts`); `currentNode` (`src/engine/state.ts`).
- Produces:

```ts
export interface NodeAction {
  id: string; // unique within one node's menu
  kind: 'connect' | 'scan-host' | 'scan-subnet' | 'login' | 'exploit' | 'disconnect' | 'wipe-logs' | 'spoof';
  label: string;
  command: string; // the exact command line to run; '' for an informational entry
  cost: string | null; // shown before the click; null when the action is free
  confirm: boolean; // true exactly when the action costs something
  disabledReason: string | null; // null when it can be run
}
export const nodeActions: (state: GameState, nodeId: string) => NodeAction[];
```

Behaviour (the tests below pin it):

- `[]` when `state.phase !== 'playing'`, when the player is on `aria_decision`, or when the node is missing or not discovered.
- **A node the player is not on:** `Connect` (`connect <ip>`; disabled with `connectBlockedMessage` when it would be refused; free) and `Scan` (`scan <ip>`; cost `+0 trace (port scanner)` or `+1–2 trace`).
- **The current node:** `Scan host` (`scan <ip>`), `Scan subnet` (`scan`), both with the scan cost; `Login as <user>` (`login <user> <password>`, free) for each credential with `obtained && !revoked`, valid on this node, granting more access than the node's current `accessLevel`; exploit entries (below); `Back to <label>` (`disconnect`, free) when `previousNodeId` is set; `Wipe logs` (`wipe-logs`, `−15 trace, uses the log wiper`) and `Spoof ID` (`spoof`, `−20 trace, uses the spoof tool`) only while the tool is held and unused.
- **Exploit entries:** only when the node is known, meaning `state.scanned` includes it or it is compromised. Known: one entry per service with `vulnerable && !patched`, command `exploit <name>`, cost `<N> charge(s), ~+<T> trace (+10 if it fails)` with `N = exploitChargeCost`, `T = traceContribution ?? 2`; disabled with `exploit-kit tool required` when the kit is missing, or `Insufficient charges (need N, have M)`. Not known: a single disabled informational entry (`label: 'Exploit', command: '', disabledReason: 'Scan this host to find services'`).
- `confirm` is `true` exactly for scan, exploit, wipe-logs and spoof; `false` for connect, login and disconnect.

- [ ] **Step 1: Write the failing unit tests**

Create `src/engine/mapActions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nodeActions } from './mapActions';
import { createInitialState } from './state';
import produce from './produce';
import type { Credential, GameState, LiveNode, Tool } from '../types/game';

const node = (s: GameState, id: string): LiveNode => {
  const n = s.network.nodes[id];
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

const withEdit = (edit: (s: GameState) => void): GameState =>
  produce(createInitialState(), edit);

const cred = (over: Partial<Credential> = {}): Credential => ({
  id: 'cred_test',
  username: 'ops.admin',
  password: 'Hunter2!',
  accessLevel: 'admin',
  validOnNodes: ['contractor_portal'],
  obtained: true,
  ...over,
});

const tool = (id: Tool['id'], used = false): Tool => ({ id, name: id, description: id, used });

const kinds = (actions: ReturnType<typeof nodeActions>) => actions.map(a => a.kind);

describe('nodeActions — when the menu is empty', () => {
  it('offers nothing for a node that is not discovered or does not exist', () => {
    const s = createInitialState();
    expect(nodeActions(s, 'ops_hr_db')).toEqual([]);
    expect(nodeActions(s, 'nope')).toEqual([]);
  });

  it('offers nothing at the decision terminal', () => {
    const s = withEdit(st => {
      node(st, 'aria_decision').discovered = true;
      st.network.currentNodeId = 'aria_decision';
    });
    expect(nodeActions(s, 'aria_decision')).toEqual([]);
    expect(nodeActions(s, 'contractor_portal')).toEqual([]);
  });

  it('offers nothing unless the game is being played', () => {
    for (const phase of ['burned', 'ended'] as const) {
      const s = withEdit(st => {
        st.phase = phase;
      });
      expect(nodeActions(s, 'contractor_portal')).toEqual([]);
    }
  });
});

describe('nodeActions — a node the player is not on', () => {
  const linked = (): GameState =>
    withEdit(st => {
      node(st, 'vpn_gateway').discovered = true;
    });

  it('offers Connect and Scan, with Scan marked as costing trace', () => {
    const actions = nodeActions(linked(), 'vpn_gateway');
    expect(kinds(actions)).toEqual(['connect', 'scan-host']);
    const [connect, scan] = actions;
    expect(connect).toMatchObject({
      command: 'connect 10.0.0.2',
      cost: null,
      confirm: false,
      disabledReason: null,
    });
    expect(scan).toMatchObject({
      command: 'scan 10.0.0.2',
      cost: '+0 trace (port scanner)',
      confirm: true,
      disabledReason: null,
    });
  });

  it('prices a scan at +1–2 trace without a port scanner', () => {
    const s = withEdit(st => {
      node(st, 'vpn_gateway').discovered = true;
      st.player.tools = st.player.tools.filter(t => t.id !== 'port-scanner');
    });
    expect(nodeActions(s, 'vpn_gateway')[1]?.cost).toBe('+1–2 trace');
  });

  it('disables Connect with the command’s own message when there is no route', () => {
    const s = withEdit(st => {
      node(st, 'ops_hr_db').discovered = true;
    });
    const [connect, scan] = nodeActions(s, 'ops_hr_db');
    expect(connect?.disabledReason).toBe('No direct route from 10.0.0.1 to 10.1.0.2');
    expect(scan?.disabledReason).toBeNull();
  });

  it('enables Connect for a pivot to a node the player holds a session on', () => {
    const s = withEdit(st => {
      node(st, 'ops_hr_db').discovered = true;
      node(st, 'ops_hr_db').accessLevel = 'user';
    });
    expect(nodeActions(s, 'ops_hr_db')[0]?.disabledReason).toBeNull();
  });
});

describe('nodeActions — the current node', () => {
  it('offers Scan host and Scan subnet, never Connect', () => {
    const actions = nodeActions(createInitialState(), 'contractor_portal');
    expect(kinds(actions)).toContain('scan-host');
    expect(kinds(actions)).toContain('scan-subnet');
    expect(kinds(actions)).not.toContain('connect');
    expect(actions.find(a => a.kind === 'scan-subnet')?.command).toBe('scan');
    expect(actions.find(a => a.kind === 'scan-host')?.command).toBe('scan 10.0.0.1');
  });

  describe('login', () => {
    const loginState = (credentials: Credential[], access: LiveNode['accessLevel'] = 'none') =>
      withEdit(st => {
        st.player.credentials = credentials;
        node(st, 'contractor_portal').accessLevel = access;
      });
    const logins = (s: GameState) =>
      nodeActions(s, 'contractor_portal').filter(a => a.kind === 'login');

    it('offers one entry per obtained credential valid here, with the password only in the command', () => {
      const [entry] = logins(loginState([cred()]));
      expect(entry).toMatchObject({
        label: 'Login as ops.admin',
        command: 'login ops.admin Hunter2!',
        cost: null,
        confirm: false,
        disabledReason: null,
      });
      expect(entry?.label).not.toContain('Hunter2!');
    });

    it('skips revoked, un-obtained and wrong-node credentials', () => {
      const s = loginState([
        cred({ id: 'a', revoked: true }),
        cred({ id: 'b', obtained: false }),
        cred({ id: 'c', validOnNodes: ['vpn_gateway'] }),
      ]);
      expect(logins(s)).toEqual([]);
    });

    it('skips a credential that would not raise the access the player already has here', () => {
      expect(logins(loginState([cred({ accessLevel: 'user' })], 'user'))).toEqual([]);
      expect(logins(loginState([cred({ accessLevel: 'user' })], 'admin'))).toEqual([]);
      expect(logins(loginState([cred({ accessLevel: 'admin' })], 'user'))).toHaveLength(1);
    });
  });

  describe('exploit', () => {
    const exploits = (s: GameState) =>
      nodeActions(s, 'contractor_portal').filter(a => a.kind === 'exploit');
    const vulnerable = (s: GameState) =>
      node(s, 'contractor_portal').services.filter(v => v.vulnerable && !v.patched);

    it('does not list services of a host that has not been scanned', () => {
      const s = createInitialState();
      expect(vulnerable(s).length).toBeGreaterThan(0);
      expect(exploits(s)).toEqual([
        {
          id: 'exploit-hint',
          kind: 'exploit',
          label: 'Exploit',
          command: '',
          cost: null,
          confirm: false,
          disabledReason: 'Scan this host to find services',
        },
      ]);
    });

    it('lists the vulnerable services of a scanned host, priced in charges and trace', () => {
      const s = withEdit(st => {
        st.scanned = ['contractor_portal'];
      });
      const entries = exploits(s);
      expect(entries.map(e => e.command)).toEqual(vulnerable(s).map(v => `exploit ${v.name}`));
      const first = vulnerable(s)[0]!;
      expect(entries[0]).toMatchObject({
        confirm: true,
        disabledReason: null,
        cost: `${String(first.exploitCost)} charge${first.exploitCost === 1 ? '' : 's'}, ~+${String(first.traceContribution ?? 2)} trace (+10 if it fails)`,
      });
    });

    it('treats a compromised host as scanned', () => {
      const s = withEdit(st => {
        node(st, 'contractor_portal').compromised = true;
      });
      expect(exploits(s)[0]?.command).toMatch(/^exploit /);
    });

    it('never lists a patched or non-vulnerable service', () => {
      const s = withEdit(st => {
        st.scanned = ['contractor_portal'];
        for (const v of node(st, 'contractor_portal').services) v.patched = true;
      });
      expect(exploits(s)).toEqual([]);
    });

    it('adds one charge to the price on a Sentinel-patched node', () => {
      const plain = withEdit(st => {
        st.scanned = ['contractor_portal'];
      });
      const patched = produce(plain, st => {
        node(st, 'contractor_portal').sentinelPatched = true;
      });
      const base = vulnerable(plain)[0]!.exploitCost;
      expect(exploits(plain)[0]?.cost).toContain(`${String(base)} charge`);
      expect(exploits(patched)[0]?.cost).toContain(`${String(base + 1)} charge`);
    });

    it('is disabled, with the reason, without the kit or without enough charges', () => {
      const noKit = withEdit(st => {
        st.scanned = ['contractor_portal'];
        st.player.tools = st.player.tools.filter(t => t.id !== 'exploit-kit');
      });
      expect(exploits(noKit)[0]?.disabledReason).toBe('exploit-kit tool required');
      const broke = withEdit(st => {
        st.scanned = ['contractor_portal'];
        st.player.charges = 0;
      });
      expect(exploits(broke)[0]?.disabledReason).toMatch(/^Insufficient charges \(need \d+, have 0\)$/);
    });
  });

  describe('disconnect and tools', () => {
    it('offers a way back only when there is a previous node', () => {
      expect(kinds(nodeActions(createInitialState(), 'contractor_portal'))).not.toContain(
        'disconnect',
      );
      const s = withEdit(st => {
        node(st, 'vpn_gateway').discovered = true;
        st.network.currentNodeId = 'vpn_gateway';
        st.network.previousNodeId = 'contractor_portal';
      });
      const back = nodeActions(s, 'vpn_gateway').find(a => a.kind === 'disconnect');
      expect(back).toMatchObject({
        command: 'disconnect',
        cost: null,
        confirm: false,
        disabledReason: null,
      });
      expect(back?.label).toBe(`Back to ${node(s, 'contractor_portal').label}`);
    });

    it('offers Wipe logs and Spoof only while the tool is held and unused, and asks to confirm', () => {
      const s = withEdit(st => {
        st.player.tools = [...st.player.tools, tool('log-wiper'), tool('spoof-id')];
      });
      const actions = nodeActions(s, 'contractor_portal');
      expect(actions.find(a => a.kind === 'wipe-logs')).toMatchObject({
        command: 'wipe-logs',
        cost: '−15 trace, uses the log wiper',
        confirm: true,
      });
      expect(actions.find(a => a.kind === 'spoof')).toMatchObject({
        command: 'spoof',
        cost: '−20 trace, uses the spoof tool',
        confirm: true,
      });
      const used = withEdit(st => {
        st.player.tools = [...st.player.tools, tool('log-wiper', true), tool('spoof-id', true)];
      });
      expect(kinds(nodeActions(used, 'contractor_portal'))).not.toContain('wipe-logs');
      expect(kinds(nodeActions(used, 'contractor_portal'))).not.toContain('spoof');
      expect(kinds(nodeActions(createInitialState(), 'contractor_portal'))).not.toContain('spoof');
    });
  });

  it('confirms exactly the actions that cost something', () => {
    const s = withEdit(st => {
      st.scanned = ['contractor_portal'];
      st.player.credentials = [cred()];
      st.player.tools = [...st.player.tools, tool('log-wiper'), tool('spoof-id')];
      node(st, 'vpn_gateway').discovered = true;
      st.network.previousNodeId = 'vpn_gateway';
    });
    for (const action of nodeActions(s, 'contractor_portal')) {
      const costs = ['scan-host', 'scan-subnet', 'exploit', 'wipe-logs', 'spoof'].includes(
        action.kind,
      );
      if (action.command === '') continue;
      expect([action.kind, action.confirm]).toEqual([action.kind, costs]);
      expect([action.kind, action.cost !== null]).toEqual([action.kind, costs]);
    }
  });

  it('gives every entry in one menu a unique id', () => {
    const s = withEdit(st => {
      st.scanned = ['contractor_portal'];
      st.player.credentials = [cred(), cred({ id: 'cred_other', username: 'other.user' })];
    });
    const ids = nodeActions(s, 'contractor_portal').map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Write the failing contract test**

Create `src/engine/__tests__/mapActions.contract.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import { nodeActions } from '../mapActions';
import { createInitialState } from '../state';
import produce from '../produce';
import type { Credential, GameState, LiveNode, Tool } from '../../types/game';

// The menu is only a front end for commands, so an entry it enables must not be refused for a
// precondition the menu should have checked. Failures of the game itself (a wrong exploit, say)
// are fine; these messages are not.
const PRECONDITION =
  /^(Usage:|Host not found|No route|No direct route|Already connected|Service not found|Insufficient charges|exploit-kit tool required|spoof-id tool required|log-wiper tool required|No previous node)|tool depleted|ACCESS DENIED|Authentication failed|CREDENTIAL REVOKED|no known vulnerability|patched — exploit unavailable/;

const node = (s: GameState, id: string): LiveNode => {
  const n = s.network.nodes[id];
  if (!n) throw new Error(`no node ${id}`);
  return n;
};
const tool = (id: Tool['id']): Tool => ({ id, name: id, description: id, used: false });
const cred = (over: Partial<Credential>): Credential => ({
  id: 'cred_t',
  username: 'ops.admin',
  password: 'Hunter2!',
  accessLevel: 'admin',
  validOnNodes: ['contractor_portal'],
  obtained: true,
  ...over,
});

const samples = (): Record<string, GameState> => ({
  'a fresh run': createInitialState(),
  'scanned and equipped': produce(createInitialState(), s => {
    s.scanned = ['contractor_portal'];
    s.player.credentials = [cred({})];
    s.player.tools = [...s.player.tools, tool('log-wiper'), tool('spoof-id')];
    node(s, 'vpn_gateway').discovered = true;
    node(s, 'ops_hr_db').discovered = true;
  }),
  'on the key anchor with a layer to cross': produce(createInitialState(), s => {
    s.network.currentNodeId = 'vpn_gateway';
    s.network.previousNodeId = 'contractor_portal';
    node(s, 'vpn_gateway').discovered = true;
    node(s, 'vpn_gateway').accessLevel = 'user';
    node(s, 'ops_cctv_ctrl').discovered = true;
    node(s, 'ops_hr_db').discovered = true;
  }),
  'with the key anchor compromised': produce(createInitialState(), s => {
    s.network.currentNodeId = 'vpn_gateway';
    s.network.previousNodeId = 'contractor_portal';
    node(s, 'vpn_gateway').discovered = true;
    node(s, 'vpn_gateway').compromised = true;
    node(s, 'vpn_gateway').accessLevel = 'admin';
    node(s, 'ops_cctv_ctrl').discovered = true;
    node(s, 'ops_hr_db').discovered = true;
  }),
  'out of charges': produce(createInitialState(), s => {
    s.scanned = ['contractor_portal'];
    s.player.charges = 0;
  }),
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          narrative: 'The AI responded.',
          traceChange: 0,
          accessGranted: false,
          newAccessLevel: null,
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
          suggestions: [],
        }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nodeActions contract: an enabled entry is never refused for a precondition', () => {
  for (const [name, state] of Object.entries(samples())) {
    it(name, async () => {
      let checked = 0;
      for (const id of Object.keys(state.network.nodes)) {
        for (const action of nodeActions(state, id)) {
          if (action.disabledReason !== null || action.command === '') continue;
          const result = await resolveCommand(action.command, state);
          const refused = result.lines
            .filter(l => l.type === 'error')
            .map(l => l.content)
            .filter(text => PRECONDITION.test(text));
          expect(refused, `${id}: ${action.command}`).toEqual([]);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  }

  it('and a disabled Connect really is refused by the command, with the same message', async () => {
    const state = samples()['scanned and equipped']!;
    const [connect] = nodeActions(state, 'ops_hr_db');
    expect(connect?.disabledReason).not.toBeNull();
    const result = await resolveCommand('connect 10.1.0.2', state);
    expect(result.lines.map(l => l.content)).toContain(connect?.disabledReason);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm test src/engine/mapActions.test.ts src/engine/__tests__/mapActions.contract.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `nodeActions`**

Create `src/engine/mapActions.ts`:

```ts
import { hasAccess } from '../types/game';
import type { GameState, LiveNode } from '../types/game';
import { connectBlockedMessage, exploitChargeCost, scanTraceRange } from './commands';
import { currentNode } from './state';

// What a click on a node of the network map may do. The map only renders this list; each entry's
// `command` is the exact line a keyboard player would type, run through the normal command path.
export interface NodeAction {
  id: string; // unique within one node's menu
  kind:
    | 'connect'
    | 'scan-host'
    | 'scan-subnet'
    | 'login'
    | 'exploit'
    | 'disconnect'
    | 'wipe-logs'
    | 'spoof';
  label: string;
  command: string; // '' for an informational entry that cannot be run
  cost: string | null; // shown before the click; null when the action is free
  confirm: boolean; // true exactly when the action costs something
  disabledReason: string | null; // null when it can be run
}

const free = (
  id: string,
  kind: NodeAction['kind'],
  label: string,
  command: string,
  disabledReason: string | null = null,
): NodeAction => ({ id, kind, label, command, cost: null, confirm: false, disabledReason });

const costly = (
  id: string,
  kind: NodeAction['kind'],
  label: string,
  command: string,
  cost: string,
  disabledReason: string | null = null,
): NodeAction => ({ id, kind, label, command, cost, confirm: true, disabledReason });

const scanCost = (state: GameState): string => {
  const { min, max } = scanTraceRange(state);
  return max === 0 ? '+0 trace (port scanner)' : `+${String(min)}–${String(max)} trace`;
};

const charges = (n: number): string => `${String(n)} charge${n === 1 ? '' : 's'}`;

const exploitActions = (state: GameState, node: LiveNode): NodeAction[] => {
  // Only what a scan has shown the player: listing services of an unscanned host would leak which
  // ones are vulnerable. A node the player has compromised is known.
  const known = state.scanned.includes(node.id) || node.compromised;
  if (!known) {
    return [
      {
        id: 'exploit-hint',
        kind: 'exploit',
        label: 'Exploit',
        command: '',
        cost: null,
        confirm: false,
        disabledReason: 'Scan this host to find services',
      },
    ];
  }
  const hasKit = state.player.tools.some(t => t.id === 'exploit-kit');
  return node.services
    .filter(svc => svc.vulnerable && !svc.patched)
    .map(svc => {
      const price = exploitChargeCost(node, svc);
      let reason: string | null = null;
      if (!hasKit) reason = 'exploit-kit tool required';
      else if (state.player.charges < price) {
        reason = `Insufficient charges (need ${String(price)}, have ${String(state.player.charges)})`;
      }
      return costly(
        `exploit:${svc.name}`,
        'exploit',
        `Exploit ${svc.name}`,
        `exploit ${svc.name}`,
        `${charges(price)}, ~+${String(svc.traceContribution ?? 2)} trace (+10 if it fails)`,
        reason,
      );
    });
};

const loginActions = (state: GameState, node: LiveNode): NodeAction[] =>
  state.player.credentials
    .filter(
      c =>
        c.obtained &&
        !c.revoked &&
        c.validOnNodes.includes(node.id) &&
        !hasAccess(node.accessLevel, c.accessLevel),
    )
    .map(c =>
      free(`login:${c.id}`, 'login', `Login as ${c.username}`, `login ${c.username} ${c.password}`),
    );

const currentNodeActions = (state: GameState, node: LiveNode): NodeAction[] => {
  const scan = scanCost(state);
  const actions: NodeAction[] = [
    costly('scan-host', 'scan-host', 'Scan host', `scan ${node.ip}`, scan),
    costly('scan-subnet', 'scan-subnet', 'Scan subnet', 'scan', scan),
    ...loginActions(state, node),
    ...exploitActions(state, node),
  ];

  const previous = state.network.previousNodeId
    ? state.network.nodes[state.network.previousNodeId]
    : undefined;
  if (previous) {
    actions.push(free('disconnect', 'disconnect', `Back to ${previous.label}`, 'disconnect'));
  }

  const unused = (id: 'log-wiper' | 'spoof-id') =>
    state.player.tools.some(t => t.id === id && !t.used);
  if (unused('log-wiper')) {
    actions.push(
      costly('wipe-logs', 'wipe-logs', 'Wipe logs', 'wipe-logs', '−15 trace, uses the log wiper'),
    );
  }
  if (unused('spoof-id')) {
    actions.push(costly('spoof', 'spoof', 'Spoof ID', 'spoof', '−20 trace, uses the spoof tool'));
  }
  return actions;
};

const otherNodeActions = (state: GameState, node: LiveNode): NodeAction[] => [
  free(`connect:${node.id}`, 'connect', 'Connect', `connect ${node.ip}`, connectBlockedMessage(state, node)),
  costly(`scan:${node.id}`, 'scan-host', 'Scan', `scan ${node.ip}`, scanCost(state)),
];

export const nodeActions = (state: GameState, nodeId: string): NodeAction[] => {
  // The engine rejects all input at the decision terminal except 1 to 4, and none once the run
  // is over, so there is nothing to offer.
  if (state.phase !== 'playing') return [];
  const here = currentNode(state);
  if (here.id === 'aria_decision') return [];
  const node = state.network.nodes[nodeId];
  if (!node?.discovered) return [];
  return node.id === here.id ? currentNodeActions(state, node) : otherNodeActions(state, node);
};
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test src/engine/mapActions.test.ts src/engine/__tests__/mapActions.contract.test.ts`
Expected: PASS. If a test fails because the real data differs from the "facts verified" in the Global Constraints (an id, an IP, a service), fix the test's data, not the rules, and say so in the report. If the contract test finds an enabled entry that the engine refuses, that is a real bug in `nodeActions` (or the shared helper): fix it there.

- [ ] **Step 6: Document it**

In `CLAUDE.md`, under "Network / nodes", add one paragraph: `**Node actions.** `GameState.scanned` (optional save field, no version bump) lists the node ids the player has scanned by IP (`scan <ip>` only; a bare `scan` lists peers and marks nothing). `nodeActions(state, nodeId)` (`src/engine/mapActions.ts`) is the pure list of what a click on a map node may do (connect, scan, login, exploit, disconnect, wipe-logs, spoof) with each action's exact command line, cost text, whether it needs a confirm, and why it is disabled. It shares its rules with the commands through `connectBlockedMessage`, `exploitChargeCost` and `scanTraceRange` (exported from `src/engine/commands.ts`), and a contract test (`src/engine/__tests__/mapActions.contract.test.ts`) runs every enabled entry through `resolveCommand`. It offers nothing at the decision terminal or when the phase is not `playing`. Design: `docs/superpowers/specs/2026-10-10-network-map-design.md`.`

- [ ] **Step 7: Full gate**

Run: `pnpm format && pnpm build && pnpm lint && pnpm test:coverage && pnpm knip`
Expected: all PASS; knip shows only the 13 pre-existing unused-type findings and one configuration hint. Remove any `export` that knip flags as new.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: nodeActions says what a click on a map node may do

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (part 1 of 4):** the `scanned` state, its save field and `scan <ip>` marking it (Task 1); the shared cost rules, including the exact connect messages (Task 2); `nodeActions` with every entry, cost text, confirm flag and disabled reason from the spec's "node menu" section, the decision-terminal and phase guards, and the contract test (Task 3); the spec's `locked` error corrected (Task 1). Parts 2 to 4 (the diagram, the menu UI, the effects) are intentionally not here.

**Placeholder scan:** none. Test data (ids, IPs) is stated in Global Constraints and Task 2/3 tests use it.

**Type consistency:** `NodeAction`, `nodeActions`, `connectBlockedMessage`, `exploitChargeCost`, `scanTraceRange` and `GameState.scanned` are spelled the same in every task.

**Review Focus:** each of the five lines has a test: decision terminal and phase (Task 3 "when the menu is empty"); credentials (Task 3 login tests); no leak and no patched services (Task 3 exploit tests); `scan` marks (Task 1 tests); contract (Task 3 contract test).
