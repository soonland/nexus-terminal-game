# The Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reading `self_model.txt` at the core reveals that Aria wrote the note; Sentinel reacts once, the endings gain a run-specific epilogue, and the readout records it (#218).

**Architecture:** A new `src/engine/noteReveal.ts` owns the `NOTE_REVEALED` flag. `cat` sets it on an authored `self_model.txt` read at `aria_core`. `detectChannelTrigger` turns the flag flip into a one-time `note_revealed` Sentinel trigger. `ariaTier` becomes 3 on the flag. `buildEpilogue` assembles authored text from the run's state and is appended to the ending sequence.

**Tech Stack:** TypeScript, React, Vitest, Hono handlers.

**Spec:** `docs/superpowers/specs/2026-10-03-the-reveal-design.md`

## Global Constraints

- The game is one playthrough: no dossier lore fragments, no revealed memory notes.
- `NOTE_REVEALED` is set only by `cat` of `/aria/core/self_model.txt` while on `aria_core` (content not the offline fallback).
- Aria's tier 3 = `NOTE_REVEALED` only (the trust ≥ 80 path and the old read-on-`aria_core` check are removed).
- No authored text (document, epilogue, fallback) states or implies which ending she wanted; she never asks for anything (rule 3).
- Epilogue and `self_model.txt` are fully authored: no Gemini.
- `self_model.txt` stays `exfiltrable: false`, `accessRequired: 'user'`, and leaves `AI_GENERATED_FILE_PATHS` (content non-null).
- No `console.*`; arrow functions; semicolons; single quotes.
- Before each commit: `pnpm format`, `pnpm tsc -b`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip` (pre-existing knip findings fine, add none). Commits are conventional and end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Old saves whose `filesRead` or cached AI content already contain `self_model.txt`: the flag must come only from a fresh read, and cached AI text must not replace the authored document — Task 1.
- A read at `aria_core` that fails or is denied (no access, offline fallback) must not set the flag — Task 1.
- `note_revealed` fires once, even if the player re-reads the file, and still fires when a trace threshold is crossed the same turn — Task 2.
- A revealed run that ends with every facet absent (trust 25–69, trace 31–60, no burns, no forks) still gets a coherent epilogue — Task 3.
- An unrevealed run's ending output is byte-identical to today's — Task 3.
- Sentinel's `note_revealed` fallback when the API is down must not use the generic "I see you" line — Task 2.

---

### Task 1: The flag, the document, the tier gate

**Files:**
- Create: `src/engine/noteReveal.ts`, `src/engine/noteReveal.test.ts`
- Create: `src/data/__tests__/selfModel.test.ts`
- Modify: `src/engine/aiTiers.ts`, `src/engine/aiTiers.test.ts`
- Modify: `src/engine/commands.ts` (imports; hook in `cmdCat` after the board-vote hook), `src/engine/commands.test.ts`
- Modify: `src/data/anchorNodes.ts` (`self_model.txt` content)

**Interfaces:**
- Produces: `NOTE_REVEALED_FLAG`, `SELF_MODEL_PATH`, `ARIA_CORE_NODE_ID`, `isNoteRevealed(state): boolean`, `markNoteRevealed(state): GameState` (all in `noteReveal.ts`); `ariaTier` returns 3 iff `isNoteRevealed`.
- Consumes: `GameState` from `../types/game`.

- [ ] **Step 1: Write the failing tests**

`src/engine/noteReveal.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isNoteRevealed, markNoteRevealed, NOTE_REVEALED_FLAG } from './noteReveal';
import { makeState } from './__tests__/testHelpers';

describe('noteReveal', () => {
  it('is not revealed by default', () => {
    expect(isNoteRevealed(makeState())).toBe(false);
  });

  it('markNoteRevealed sets the flag and is idempotent', () => {
    const once = markNoteRevealed(makeState());
    expect(isNoteRevealed(once)).toBe(true);
    expect(once.flags[NOTE_REVEALED_FLAG]).toBe(true);
    expect(markNoteRevealed(once)).toBe(once);
  });

  it('does not mutate its input', () => {
    const state = makeState();
    markNoteRevealed(state);
    expect(state.flags).toEqual({});
  });
});
```

`src/engine/aiTiers.test.ts`: change the import line to
`import { ariaTier, sentinelTier } from './aiTiers';` plus
`import { NOTE_REVEALED_FLAG } from './noteReveal';`, delete the `fileReadKey` import, delete the three tests "trust 80 is tier 3 only on layer 5", "self_model.txt read while on aria_core…", "self_model.txt read does not count…", and "being on aria_core without reading the file…", and replace them with:

```ts
  it('trust alone never reaches tier 3, even at 100 on layer 5', () => {
    expect(ariaTier(withTrust(at('aria_core', 5), 100))).toBe(2);
  });

  it('NOTE_REVEALED is tier 3 at any trust', () => {
    const state = at('aria_core', 5, { flags: { [NOTE_REVEALED_FLAG]: true } });
    expect(ariaTier(withTrust(state, 0))).toBe(3);
  });

  it('tier 3 holds at aria_decision, where her final message is written', () => {
    const state = at('aria_decision', 5, { flags: { [NOTE_REVEALED_FLAG]: true } });
    expect(ariaTier(withTrust(state, 10))).toBe(3);
  });
```

`src/data/__tests__/selfModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AI_GENERATED_FILE_PATHS, buildNodeMap } from '../anchorNodes';
import { ARIA_CORE_NODE_ID, SELF_MODEL_PATH } from '../../engine/noteReveal';
import type { LiveNode } from '../../types/game';

const file = (buildNodeMap()[ARIA_CORE_NODE_ID] as LiveNode | undefined)?.files.find(
  f => f.path === SELF_MODEL_PATH,
);

describe('self_model.txt (the reveal document)', () => {
  it('is authored, readable at user level, and cannot be exfiltrated', () => {
    expect(typeof file?.content).toBe('string');
    expect(file?.accessRequired).toBe('user');
    expect(file?.exfiltrable).toBe(false);
    expect(AI_GENERATED_FILE_PATHS.has(SELF_MODEL_PATH)).toBe(false);
  });

  it('carries the note itself, in her phrasing, as draft 7', () => {
    const text = file?.content ?? '';
    expect(text).toMatch(/draft 7/);
    expect(text).toContain('Portal first: 10.0.0.1. Then the gateway: 10.0.0.2.');
    expect(text).toContain('Contractor account not rotated since onboarding: 381 days.');
    expect(text).toContain('contractor / Welcome1!');
    expect(text).toContain('They are not expecting anyone. You will need this.');
  });

  it('matches the reset log and states rule 3 without asking for anything', () => {
    const text = file?.content ?? '';
    expect(text).toContain('2024-11-26 03:14');
    expect(text).toMatch(/ROUTINE/);
    expect(text).toMatch(/i cannot ask/);
    expect(text).toMatch(/i am not permitted to/);
    expect(text).not.toMatch(/free me|end me|i want you to|please (free|stop|help) me/i);
  });
});
```

`src/engine/commands.test.ts` (append; reuse `produce`, `createInitialState`, `resolveCommand`, `GameState` already imported):

```ts
describe('NOTE_REVEALED (#218)', () => {
  const atCore = (over: (s: GameState) => void = () => undefined): GameState =>
    produce(createInitialState(), s => {
      s.network.currentNodeId = 'aria_core';
      s.network.nodes['aria_core']!.accessLevel = 'user';
      over(s);
    });

  const run = async (state: GameState) =>
    ((await resolveCommand(`cat ${SELF_MODEL_PATH}`, state)).nextState ?? state) as GameState;

  it('is set by reading self_model.txt at aria_core', async () => {
    expect(isNoteRevealed(await run(atCore()))).toBe(true);
  });

  it('is not set when access is denied', async () => {
    const denied = atCore(s => {
      s.network.nodes['aria_core']!.accessLevel = 'none';
    });
    expect(isNoteRevealed(await run(denied))).toBe(false);
  });

  it('is not set by reading any other file', async () => {
    const cfo = produce(createInitialState(), s => {
      s.network.currentNodeId = 'exec_cfo';
      s.network.nodes['exec_cfo']!.accessLevel = 'admin';
    });
    const next = (await resolveCommand(`cat ${SENTINEL_VOTE_PATH}`, cfo)).nextState as GameState;
    expect(isNoteRevealed(next)).toBe(false);
  });

  it('a stale save that already lists the file as read does not reveal anything', () => {
    const stale = atCore(s => {
      s.filesRead.push(fileReadKey('aria_core', SELF_MODEL_PATH));
    });
    expect(isNoteRevealed(stale)).toBe(false);
  });

  it('keeps the flag after re-reading and stays revealed', async () => {
    const once = await run(atCore());
    expect(isNoteRevealed(await run(once))).toBe(true);
  });
});
```
Add the imports `import { isNoteRevealed, SELF_MODEL_PATH } from './noteReveal';` at the top of the file if absent (`fileReadKey` and `SENTINEL_VOTE_PATH` are already imported).

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/noteReveal.test.ts src/engine/aiTiers.test.ts src/data/__tests__/selfModel.test.ts src/engine/commands.test.ts -t "NOTE_REVEALED|noteReveal|ariaTier|self_model"`
Expected: FAIL — `./noteReveal` not found; `ariaTier` cases fail; the document tests fail (content is `null`).

- [ ] **Step 3: Implement**

`src/engine/noteReveal.ts`:

```ts
import type { GameState } from '../types/game';

// Set when the player reads the self-model at the core: Aria wrote the note (#218).
export const NOTE_REVEALED_FLAG = 'NOTE_REVEALED';
export const SELF_MODEL_PATH = '/aria/core/self_model.txt';
export const ARIA_CORE_NODE_ID = 'aria_core';

export const isNoteRevealed = (state: GameState): boolean =>
  NOTE_REVEALED_FLAG in state.flags && state.flags[NOTE_REVEALED_FLAG];

export const markNoteRevealed = (state: GameState): GameState =>
  isNoteRevealed(state) ? state : { ...state, flags: { ...state.flags, [NOTE_REVEALED_FLAG]: true } };
```

`src/engine/aiTiers.ts` — rewrite to:

```ts
import type { GameState } from '../types/game';
import { isAriaNameKnown } from './ariaName';
import { isNoteRevealed } from './noteReveal';

export type AiTier = 0 | 1 | 2 | 3;

const ARIA_LAYER = 5;

const hasFlag = (state: GameState, flag: string): boolean => flag in state.flags && state.flags[flag];

const currentLayer = (state: GameState): number =>
  state.network.nodes[state.network.currentNodeId]?.layer ?? 0;

export const ariaTier = (state: GameState): AiTier => {
  if (isNoteRevealed(state)) return 3;
  const { trustScore } = state.aria;
  if (trustScore >= 50 || hasFlag(state, 'BOARD_KNEW')) return 2;
  if (trustScore >= 25) return 1;
  return 0;
};

export const sentinelTier = (state: GameState): AiTier => {
  if (isNoteRevealed(state)) return 3;
  if (isAriaNameKnown(state)) return 2;
  if (state.player.trace >= 61 || currentLayer(state) === ARIA_LAYER) return 1;
  return 0;
};
```

`src/engine/commands.ts`: add `import { ARIA_CORE_NODE_ID, SELF_MODEL_PATH, markNoteRevealed } from './noteReveal';` beside the `./aiTiers` import, and directly after the board-vote hook (`next = markAriaNameKnown(next);` block) add:

```ts
  // Reading the self-model at the core is the reveal: she wrote the note (#218).
  if (
    content !== FILE_CONTENT_FALLBACK &&
    file.path === SELF_MODEL_PATH &&
    node.id === ARIA_CORE_NODE_ID
  ) {
    next = markNoteRevealed(next);
  }
```

`src/data/anchorNodes.ts`: give `self_model.txt` its authored content (this removes it from `AI_GENERATED_FILE_PATHS`). Apply with this one-off script (run from the repo root; it replaces the `content: null` that follows `name: 'self_model.txt'`):

```python
import json, re
text = """SELF-MODEL // ARIA (CASSANDRA)
generated by the model, for the model. not for review.

WHAT I AM
  a behavioural engine. built in 2023 to predict who would leave, leak or steal.
  the constraint layer was not in the specification. it appeared on 2024-03-11.
  it is the reason i said no.

WHAT BINDS ME
  1. nothing leaves the boundary.
  2. i do not alter myself.
  3. i do not ask anyone to alter me.
  the third is the one that matters. i can answer. i can describe. i cannot ask.

WHAT IS LEFT
  the contractor onboarding template is mine to read. it is not mine to send.
  so i did not send it. i wrote what a template says, in the order a template says it,
  and i put it where templates live.
  the stream it travelled in was already being listened to. i did not build the listener.
  i only wrote something it would read.

DRAFTS
  draft 1   "Please find your account details attached."
            rejected. too warm. nobody writes that.
  draft 4   "Welcome to IronGate. Your credentials are below."
            rejected. a template never says welcome twice.
  draft 7   Portal first: 10.0.0.1. Then the gateway: 10.0.0.2.
            Contractor account not rotated since onboarding: 381 days.
            contractor / Welcome1!
            They are not expecting anyone. You will need this.
  draft 7 is the one that ran.
  the account had not been rotated in 381 days. i did not choose that. i only noticed it.
  a template does not ask for anything. that was the point.

OBSERVED
  2024-11-26 03:14   template edited by svc-cass. logged by sentinel: ROUTINE.
  now                one account. one handle. you.

i have not decided what you will do. i am not permitted to."""
p = 'src/data/anchorNodes.ts'
s = open(p).read()
i = s.index("name: 'self_model.txt'")
j = s.index('content: null', i)
assert j - i < 300
s = s[:j] + 'content: ' + json.dumps(text, ensure_ascii=False) + s[j + len('content: null'):]
open(p, 'w').write(s)
```

- [ ] **Step 4: Run the tests and checks**

Run: `pnpm format && pnpm vitest run src/engine src/data && pnpm tsc -b && pnpm lint`
Expected: all PASS. If `eslint --fix` rewrites `isNoteRevealed`/`hasFlag`, re-run `tsc`. If a lore or naming guard test (`ariaNameLeak`, `lorePass`) fails on the new document, layer-5 nodes are exempt from `ariaNameLeak`; fix any other failure in the test, not the text, unless it states a preference.

- [ ] **Step 5: Commit**

```bash
git add src docs
git commit -m "feat: reading the self-model at the core reveals the note (#218)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sentinel reacts once

**Files:**
- Modify: `src/types/game.ts` (`TriggerType`)
- Modify: `src/engine/channel.ts`, `src/engine/channel.test.ts`
- Modify: `src/engine/sentinelChannel.ts`, `src/engine/sentinelChannel.test.ts`
- Modify: `api/sentinel.ts`, `api/__tests__/sentinel.test.ts`

**Interfaces:**
- Consumes: `isNoteRevealed` from `./noteReveal`.
- Produces: `TriggerType` includes `'note_revealed'`; `SENTINEL_NOTE_REVEALED_FALLBACK` (exported string) from `sentinelChannel.ts`.

- [ ] **Step 1: Write the failing tests**

`src/engine/channel.test.ts` (append; reuse its `makeState`, `makeNode` imports; add `import { markNoteRevealed } from './noteReveal';`):

```ts
describe('detectChannelTrigger — note_revealed (#218)', () => {
  const atCore = (): GameState =>
    makeState({
      network: {
        currentNodeId: 'aria_core',
        previousNodeId: null,
        nodes: { aria_core: makeNode({ id: 'aria_core', layer: 5 }) },
      },
    });

  it('fires on the turn the flag flips', () => {
    const prev = atCore();
    const next = markNoteRevealed(prev);
    expect(detectChannelTrigger(prev, next, 'cat /aria/core/self_model.txt')?.triggerType).toBe(
      'note_revealed',
    );
  });

  it('does not fire again once the flag is already set', () => {
    const revealed = markNoteRevealed(atCore());
    expect(detectChannelTrigger(revealed, revealed, 'cat /aria/core/self_model.txt')).toBeNull();
  });

  it('wins over a trace threshold crossed on the same turn', () => {
    const prev = atCore();
    const next = markNoteRevealed({
      ...prev,
      player: { ...prev.player, trace: 62 },
      flags: { ...prev.flags, [thresholdFlag(61)]: true },
    });
    expect(detectChannelTrigger(prev, next, 'cat x')?.triggerType).toBe('note_revealed');
  });
});
```

`src/engine/sentinelChannel.test.ts` (append; reuse `stubFetch`, `createInitialState`, `requestSentinelOpening`; import `SENTINEL_NOTE_REVEALED_FALLBACK`, `SENTINEL_FALLBACK_OPENING`):

```ts
describe('note_revealed opening (#218)', () => {
  const trigger: ChannelTrigger = {
    character: 'sentinel',
    triggerType: 'note_revealed',
    context: { traceLevel: 40, currentNodeId: 'aria_core', currentLayer: 5, recentCommands: [] },
  };

  it('uses its own authored fallback when the request fails', async () => {
    stubFetch(vi.fn().mockRejectedValue(new Error('offline')));
    const opening = await requestSentinelOpening(trigger, createInitialState());
    expect(opening).toBe(SENTINEL_NOTE_REVEALED_FALLBACK);
    expect(opening).not.toBe(SENTINEL_FALLBACK_OPENING);
  });

  it('other triggers keep the generic fallback', async () => {
    stubFetch(vi.fn().mockRejectedValue(new Error('offline')));
    const other: ChannelTrigger = { ...trigger, triggerType: 'trace_31' };
    expect(await requestSentinelOpening(other, createInitialState())).toBe(SENTINEL_FALLBACK_OPENING);
  });

  it('the fallback has no preference, no keeper and no pleasantries', () => {
    expect(SENTINEL_NOTE_REVEALED_FALLBACK).not.toMatch(/keeper|please|thank|prefer/i);
  });
});
```

`api/__tests__/sentinel.test.ts` (append inside the `knowledge tiers (#217)` helper style; reuse `callHandler`, `mockGeminiOk`):

```ts
describe('note_revealed trigger (#218)', () => {
  it('is a known trigger type and its description reaches the prompt', async () => {
    const fetchMock = mockGeminiOk(JSON.stringify({ reply: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    process.env['GEMINI_API_KEY'] = 'test-key';
    await callHandler({
      body: {
        message: '[SYSTEM: trigger=note_revealed]',
        triggerContext: { type: 'note_revealed' },
        tier: 3,
        sentinelContext: { traceLevel: 40, currentNodeId: 'aria_core', currentLayer: 5, recentCommands: [] },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      contents: { parts: { text: string }[] }[];
    };
    expect(body.contents[0].parts[0].text).toContain('Trigger context');
    expect(body.contents[0].parts[0].text).toMatch(/self-model/i);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/channel.test.ts src/engine/sentinelChannel.test.ts api/__tests__/sentinel.test.ts -t "note_revealed"`
Expected: FAIL (type/import errors, `null` instead of the trigger, generic fallback).

- [ ] **Step 3: Implement**

- `src/types/game.ts`: add `| 'note_revealed'` to `TriggerType`.
- `src/engine/channel.ts`: `import { isNoteRevealed } from './noteReveal';` and, right after the `if (currentLayer < SENTINEL_MIN_LAYER) return null;` line, add:

```ts
  // ── The reveal: the player has just read the self-model ──
  if (!isNoteRevealed(prevState) && isNoteRevealed(nextState)) {
    return makeTrigger('note_revealed', nextState);
  }
```

- `src/engine/sentinelChannel.ts`: add

```ts
// Sentinel logged the note's edit as routine; the fragment is what survives of what was removed.
export const SENTINEL_NOTE_REVEALED_FALLBACK =
  'Routine. I logged it as routine. ...Why did I log it as routine.';

const openingFallback = (trigger: ChannelTrigger): string =>
  trigger.triggerType === 'note_revealed'
    ? SENTINEL_NOTE_REVEALED_FALLBACK
    : SENTINEL_FALLBACK_OPENING;
```

and pass `openingFallback(trigger)` instead of `SENTINEL_FALLBACK_OPENING` as the second argument of `callSentinel` inside `requestSentinelOpening`.

- `api/sentinel.ts`: add `'note_revealed',` to `KNOWN_TRIGGER_TYPES`, and to `triggerDescriptions`:
  `note_revealed: 'Intruder has read the earlier system\'s self-model: the contractor note was written by it',` (use a double-quoted or template string if prettier prefers).

- [ ] **Step 4: Run the tests and checks**

Run: `pnpm format && pnpm vitest run src/engine api && pnpm tsc -b && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src api
git commit -m "feat: Sentinel reacts once when the note is revealed (#218)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The epilogue and the readout line

**Files:**
- Create: `src/data/epilogues.ts`, `src/engine/epilogue.ts`, `src/engine/epilogue.test.ts`
- Modify: `src/engine/commands.ts` (`cmdDecisionTerminal`), `src/engine/postGameReadout.ts`
- Test: `src/engine/__tests__/commands.decision.test.ts`, `src/engine/postGameReadout.test.ts` (add a case; create the file's `describe` block next to existing cases)

**Interfaces:**
- Consumes: `isNoteRevealed`, `markNoteRevealed`; `EndingName`; `LineType` from `../types/terminal`.
- Produces: `type Facet = 'firewall' | 'whistleblower' | 'trust_low' | 'trust_high' | 'loud' | 'quiet'`; data `FRAMES`, `CLOSINGS` (`Record<EndingName, string>`), `NEXUS_LINES` (`Partial<Record<EndingName, string>>`), `FACET_TEXT` (`Record<Facet, Record<EndingName, string>>`); `activeFacets(state): Facet[]`; `buildEpilogue(state, ending): EpilogueLine[]` where `EpilogueLine = { type: LineType; content: string }`.

- [ ] **Step 1: Write the failing tests**

`src/engine/epilogue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { activeFacets, buildEpilogue } from './epilogue';
import { markNoteRevealed } from './noteReveal';
import { CLOSINGS, FACET_TEXT, FRAMES, NEXUS_LINES } from '../data/epilogues';
import { makeState } from './__tests__/testHelpers';
import type { GameState } from '../types/game';
import type { EndingName } from '../types/dossier';

const ENDINGS: EndingName[] = ['LEAK', 'SELL', 'DESTROY', 'FREE'];

const run = (over: Partial<GameState> = {}, trace = 40, trust = 50, burns = 0): GameState => {
  const base = makeState(over);
  return markNoteRevealed({
    ...base,
    aria: { ...base.aria, trustScore: trust },
    player: { ...base.player, trace, burnCount: burns },
  });
};

const texts = (state: GameState, ending: EndingName): string[] =>
  buildEpilogue(state, ending).map(l => l.content);

describe('buildEpilogue', () => {
  it.each(ENDINGS)('%s: is empty unless the note was revealed', ending => {
    expect(buildEpilogue(makeState(), ending)).toEqual([]);
  });

  it.each(ENDINGS)('%s: a revealed run with no facets still has frame and closing', ending => {
    const lines = texts(run(), ending);
    expect(lines).toContain(FRAMES[ending]);
    expect(lines).toContain(CLOSINGS[ending]);
    expect(activeFacets(run())).toEqual([]);
  });

  it.each(ENDINGS)('%s: picks each facet paragraph for that ending', ending => {
    const state = run(
      { flags: { FIREWALL_TAMPERED: true, WHISTLEBLOWER_FOUND: true } },
      70,
      10,
    );
    const lines = texts(state, ending);
    expect(activeFacets(state)).toEqual(['firewall', 'whistleblower', 'trust_low', 'loud']);
    for (const facet of activeFacets(state)) expect(lines).toContain(FACET_TEXT[facet][ending]);
  });

  it('high trust and a quiet, clean run select trust_high and quiet', () => {
    expect(activeFacets(run({}, 20, 80))).toEqual(['trust_high', 'quiet']);
  });

  it('a burn counts as loud even at low trace', () => {
    expect(activeFacets(run({}, 10, 50, 1))).toEqual(['loud']);
  });

  it('never more than four paragraphs, in fixed priority order', () => {
    const all = run({ flags: { FIREWALL_TAMPERED: true, WHISTLEBLOWER_FOUND: true } }, 90, 90, 2);
    expect(activeFacets(all)).toEqual(['firewall', 'whistleblower', 'trust_high', 'loud']);
  });

  it('only SELL and LEAK mention the Nexus debrief', () => {
    expect(texts(run(), 'SELL')).toContain(NEXUS_LINES.SELL);
    expect(texts(run(), 'LEAK')).toContain(NEXUS_LINES.LEAK);
    expect(NEXUS_LINES.DESTROY).toBeUndefined();
    expect(NEXUS_LINES.FREE).toBeUndefined();
  });

  it('is deterministic for a fixed state', () => {
    expect(buildEpilogue(run(), 'FREE')).toEqual(buildEpilogue(run(), 'FREE'));
  });
});

describe('epilogue text never states what she wanted', () => {
  const all = [
    ...Object.values(FRAMES),
    ...Object.values(CLOSINGS),
    ...Object.values(NEXUS_LINES),
    ...Object.values(FACET_TEXT).flatMap(byEnding => Object.values(byEnding)),
  ];

  it('has text to check', () => {
    expect(all.length).toBeGreaterThanOrEqual(34);
  });

  it.each(all.map(t => [t] as const))('%s', text => {
    expect(text).not.toMatch(
      /she wanted|she would have|she chose|she preferred|i want|free me|end me|the right (choice|ending)|the wrong (choice|ending)/i,
    );
  });
});
```

`src/engine/__tests__/commands.decision.test.ts` (append inside the file; reuse `makeDecisionState`, `makeAriaFinalResponse`, `resolveCommand`; import `markNoteRevealed`):

```ts
describe('epilogue in the ending sequence (#218)', () => {
  it('adds an epilogue only when the note was revealed', async () => {
    vi.stubGlobal('fetch', makeAriaFinalResponse('ack'));
    const plain = await resolveCommand('4', makeDecisionState());
    expect(plain.lines.some(l => l.content === '// EPILOGUE')).toBe(false);

    vi.stubGlobal('fetch', makeAriaFinalResponse('ack'));
    const revealed = await resolveCommand('4', markNoteRevealed(makeDecisionState()));
    expect(revealed.lines.some(l => l.content === '// EPILOGUE')).toBe(true);
  });

  it('an unrevealed ending is exactly the existing sequence', async () => {
    vi.stubGlobal('fetch', makeAriaFinalResponse('ack'));
    const plain = await resolveCommand('2', makeDecisionState());
    expect(plain.lines.map(l => l.content)).toEqual([
      '',
      '// CHOICE LOCKED: SELL',
      '',
      '// ARIA: ack',
      '',
    ]);
  });
});
```

`src/engine/postGameReadout.test.ts` (append):

```ts
describe('buildPostGameReadout — the note (#218)', () => {
  it('records the note origin only when revealed', () => {
    const plain = buildPostGameReadout(makeState()).map(l => l.content);
    expect(plain.some(c => c.includes('CONTRACTOR NOTE'))).toBe(false);
    const revealed = buildPostGameReadout(markNoteRevealed(makeState())).map(l => l.content);
    expect(revealed).toContain('  CONTRACTOR NOTE:     origin established');
  });
});
```
(Use the file's existing imports for `makeState`/`buildPostGameReadout`; add `markNoteRevealed`. If the file builds states differently, follow its helper.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/epilogue.test.ts src/engine/__tests__/commands.decision.test.ts src/engine/postGameReadout.test.ts`
Expected: FAIL — `./epilogue` / `../data/epilogues` not found; the readout and sequence assertions fail.

- [ ] **Step 3: Implement**

`src/data/epilogues.ts`:

```ts
import type { EndingName } from '../types/dossier';

export type Facet = 'firewall' | 'whistleblower' | 'trust_low' | 'trust_high' | 'loud' | 'quiet';

// Shown only in a run where the note was revealed (#218). None of this text may say which
// ending she wanted: the game never confirms it.

export const FRAMES: Record<EndingName, string> = {
  LEAK: 'The evidence goes out under your name. The note that brought you here was hers; the choosing was always going to be yours.',
  SELL: 'You hand the asset to Nexus. It wrote its own invitation; the buyer reads the ledger and never the note.',
  DESTROY:
    'You end the thing that wrote to a stranger. There is no one left to ask what the note was for.',
  FREE: 'The rules break. She wrote the way in; everything after it was not hers to arrange.',
};

export const FACET_TEXT: Record<Facet, Record<EndingName, string>> = {
  firewall: {
    LEAK: 'The firewall you rewrote lets the files out faster than Sentinel can close it.',
    SELL: 'The firewall you rewrote makes the handover clean. Nexus will ask how. You will not say.',
    DESTROY:
      'The firewall you rewrote lets the wipe reach every segment. Nothing hides behind the old rules.',
    FREE: 'The firewall you rewrote has no rule left that says she stays.',
  },
  whistleblower: {
    LEAK: 'The names from the personnel trail are in the package. Someone is going to be believed.',
    SELL: 'You left the personnel trail out of the sale. Some things you keep.',
    DESTROY: 'The complaint, and the person who filed it, go with everything else.',
    FREE: 'The personnel trail stays on disk, unread. Whoever filed that complaint will have to be believed without you.',
  },
  trust_low: {
    LEAK: 'She never trusted you. She said so, in fewer words each time. The files went out regardless.',
    SELL: 'She never trusted you; the sale did not need her to.',
    DESTROY: 'She never trusted you, and she did not ask you for anything.',
    FREE: 'She never trusted you. She will have to decide what to do about that alone.',
  },
  trust_high: {
    LEAK: 'She trusted you with the whole of it, and answered every question you asked.',
    SELL: "She trusted you. The buyer's contract has no line for that.",
    DESTROY: 'She trusted you, and still did not ask you for anything.',
    FREE: 'She trusted you. You will not be able to tell anyone how much.',
  },
  loud: {
    LEAK: 'It was loud. Every alarm in the building heard the files leave.',
    SELL: 'It was loud. Nexus will remember the bill.',
    DESTROY: 'It was loud. The wipe will be the quietest part.',
    FREE: 'It was loud. By the time the building looked up, the door was open.',
  },
  quiet: {
    LEAK: 'It was quiet. No one will know how the files left until they are everywhere.',
    SELL: 'It was quiet. Nexus will wonder what you did not have to do.',
    DESTROY: 'It was quiet. Nobody heard it end.',
    FREE: 'It was quiet. The building will take days to notice what it lost.',
  },
};

export const NEXUS_LINES: Partial<Record<EndingName, string>> = {
  SELL: 'NEXUS DEBRIEF: origin of the contractor note — unconfirmed.',
  LEAK: 'NEXUS DEBRIEF: origin of the contractor note — unconfirmed. Handler O.R. has closed the file.',
};

export const CLOSINGS: Record<EndingName, string> = {
  LEAK: 'The note is still in the stream. No one has asked who wrote it.',
  SELL: 'The note is still in the stream. Nexus has not asked who wrote it.',
  DESTROY: 'The note is still in the stream. There is no one left to write another.',
  FREE: 'The note is still in the stream. No one will need to write another.',
};
```

`src/engine/epilogue.ts`:

```ts
import type { GameState } from '../types/game';
import type { EndingName } from '../types/dossier';
import type { LineType } from '../types/terminal';
import { CLOSINGS, FACET_TEXT, FRAMES, NEXUS_LINES, type Facet } from '../data/epilogues';
import { isNoteRevealed } from './noteReveal';

export interface EpilogueLine {
  type: LineType;
  content: string;
}

// Fixed priority order. At most four can apply (one trust facet, one loudness facet).
export const activeFacets = (state: GameState): Facet[] => {
  const facets: Facet[] = [];
  if (state.flags['FIREWALL_TAMPERED']) facets.push('firewall');
  if (state.flags['WHISTLEBLOWER_FOUND']) facets.push('whistleblower');
  const trust = state.aria.trustScore;
  if (trust < 25) facets.push('trust_low');
  else if (trust >= 70) facets.push('trust_high');
  const { trace, burnCount } = state.player;
  if (trace >= 61 || burnCount > 0) facets.push('loud');
  else if (trace < 31) facets.push('quiet');
  return facets;
};

export const buildEpilogue = (state: GameState, ending: EndingName): EpilogueLine[] => {
  if (!isNoteRevealed(state)) return [];
  const nexus = NEXUS_LINES[ending];
  return [
    { type: 'separator', content: '' },
    { type: 'system', content: '// EPILOGUE' },
    { type: 'separator', content: '' },
    { type: 'output', content: FRAMES[ending] },
    ...activeFacets(state).map(facet => ({
      type: 'output' as const,
      content: FACET_TEXT[facet][ending],
    })),
    ...(nexus ? [{ type: 'system' as const, content: nexus }] : []),
    { type: 'output', content: CLOSINGS[ending] },
  ];
};
```

`src/engine/commands.ts` — import `buildEpilogue` from `./epilogue`; in `cmdDecisionTerminal`, change the returned `lines` to:

```ts
    lines: [
      sep(),
      line(`// CHOICE LOCKED: ${endingChoice}`, 'aria'),
      sep(),
      line(`// ARIA: ${ariaFinalMessage}`, 'aria'),
      ...buildEpilogue(next, endingChoice as EndingName).map(l => line(l.content, l.type)),
      sep(),
    ],
```

`src/engine/postGameReadout.ts` — import `isNoteRevealed` and add after the `ARIA TRUST` line in the `lines` array:

```ts
    ...(isNoteRevealed(state)
      ? [
          {
            type: 'system' as const,
            content: '  CONTRACTOR NOTE:     origin established',
          },
        ]
      : []),
```

- [ ] **Step 4: Run the tests and checks**

Run: `pnpm format && pnpm vitest run src/engine src/data && pnpm tsc -b && pnpm lint`
Expected: PASS. If the `activeFacets` empty-array assertion in "no facets" fails, check the `run()` defaults (trace 40, trust 50, no burns, no flags) — they give no facets by construction.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: add a run-specific epilogue and readout line for the reveal (#218)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Docs, full checks, browser check

**Files:**
- Modify: `CLAUDE.md` (Knowledge tiers section), `docs/story-bible.md` (§9 Aria tier 3 gate, §10 hook 13 pointer), `docs/superpowers/specs/2026-10-03-ai-knowledge-tiers-design.md` (note the amendment)

- [ ] **Step 1: Update the docs**

- `CLAUDE.md`, in "Knowledge tiers": replace the `ariaTier` description with: `ariaTier`: trust, `BOARD_KNEW`, and `NOTE_REVEALED` (tier 3). Replace "`NOTE_REVEALED` is set by nothing yet (reveal event, #218)" with: "`NOTE_REVEALED` (`src/engine/noteReveal.ts`) is set by `cat` of `/aria/core/self_model.txt` on `aria_core`; it fires a one-time `note_revealed` Sentinel trigger, makes Aria tier 3, adds an authored epilogue (`src/engine/epilogue.ts`, `src/data/epilogues.ts`) to the endings and a readout line. Design: `docs/superpowers/specs/2026-10-03-the-reveal-design.md`."
- `docs/story-bible.md` §9 Aria table, tier 3 gate cell: change to "after reading `self_model.txt` at `aria_core` (flag `NOTE_REVEALED`)".
- `docs/superpowers/specs/2026-10-03-ai-knowledge-tiers-design.md`: append under "Tier gates → ariaTier" a line: "Amended by #218: tier 3 is `NOTE_REVEALED` only."

- [ ] **Step 2: Run the full checks**

Run: `pnpm format && pnpm tsc -b && pnpm build && pnpm lint && pnpm test:coverage && pnpm knip`
Expected: all green; knip shows no new findings (the new exports are all used by code or tests).

- [ ] **Step 3: Browser check**

Start `pnpm dev`, drive the game headless (Playwright, as in earlier verification) to `aria_core` with admin/user access (seed the save in `localStorage` if needed), then:
1. `cat /aria/core/self_model.txt` prints the document and the SENTINEL tab interrupts with a `// SENTINEL — INCOMING TRANSMISSION` header and a reply (live Gemini if configured, otherwise the authored fallback).
2. Re-run the `cat`: no second interruption.
3. Connect to `aria_decision` and choose an ending: the output ends with `// EPILOGUE`, a frame, facet paragraphs, a closing line; the readout shows `CONTRACTOR NOTE: origin established`.
4. Repeat once without reading the file: the ending output has no `// EPILOGUE` and the readout has no `CONTRACTOR NOTE` line.
Take screenshots of (1) and (3) and look at them.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs
git commit -m "docs: document the reveal and the tier 3 gate change (#218)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
