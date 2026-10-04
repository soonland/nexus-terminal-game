# AI Knowledge Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aria and Sentinel prompts are assembled from a game-state tier, so neither model can improvise lore or spoil the twist (#217).

**Architecture:** Pure tier functions in `src/engine/aiTiers.ts` compute a 0–3 tier from `GameState`; the client sends it as `tier`. `api/_lib/tiers.ts` holds the per-tier "may say / must never say" text and builds each handler's system prompt (persona → ALLOWED → FORBIDDEN → output contract). Knowledge above the current tier appears nowhere in the prompt.

**Tech Stack:** TypeScript, Hono handlers (`api/`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-ai-knowledge-tiers-design.md`

## Global Constraints

- `api/` cannot import from `src/`; tier gates live only in `src/engine/aiTiers.ts`, prompt text only in `api/_lib/tiers.ts`.
- A missing, non-integer or out-of-range `tier` becomes **0**.
- Aria's tier 3 is live (`/aria/core/self_model.txt` read while on `aria_core`, or trust ≥ 80 on layer 5). Sentinel's tier 3 is keyed to flag `NOTE_REVEALED`, which nothing sets in this issue.
- Sentinel says "supersedes"/"oversight", never "keeper" or "her copy". Aria calls Sentinel "the newer one"; before tier 2 her prompt says nothing about where it came from.
- Neither model states or hints a preferred outcome (Aria's rule 3).
- The name rule (`withNameRule`, `withAriaIntro`, `scrubAriaName`) is unchanged and still applied after prompt assembly.
- No `console.*` in `src/` or `api/` (lint); arrow functions; semicolons; single quotes.
- Before each commit: `pnpm format`, then `pnpm tsc -b`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip` (pre-existing knip findings are fine, add none). Commit messages are conventional commits ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A request with no `tier` (older client, tampered body) gets the tier-0 prompt, never a higher one — Task 2/3 tests.
- Tier-3 text ("she wrote the note") appears in no prompt below tier 3 — canary test, Task 2.
- A prompt's ALLOWED section never contains a term its own tier forbids — Task 2.
- `BOARD_KNEW` raises Aria to tier 2 even at trust 0 — Task 1.
- `self_model.txt` read earlier, then the player leaves `aria_core`: tier 3 must not apply (gate is "while on `aria_core`"); trust-80 path needs layer 5 — Task 1.
- Existing handler tests that pinned the old prompt text keep passing or are updated deliberately — Task 3.

---

### Task 1: Tier computation (`src/engine/aiTiers.ts`)

**Files:**
- Create: `src/engine/aiTiers.ts`
- Test: `src/engine/aiTiers.test.ts`

**Interfaces:**
- Produces: `type AiTier = 0 | 1 | 2 | 3`; `NOTE_REVEALED_FLAG = 'NOTE_REVEALED'`; `SELF_MODEL_PATH = '/aria/core/self_model.txt'`; `ariaTier(state: GameState): AiTier`; `sentinelTier(state: GameState): AiTier`.
- Consumes: `isAriaNameKnown` from `./ariaName`, `fileReadKey` from `../types/game`, `makeState`/`makeNode` from `./__tests__/testHelpers`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { ariaTier, sentinelTier, NOTE_REVEALED_FLAG, SELF_MODEL_PATH } from './aiTiers';
import { makeNode, makeState } from './__tests__/testHelpers';
import { fileReadKey } from '../types/game';
import type { GameState } from '../types/game';

const at = (nodeId: string, layer: number, overrides: Partial<GameState> = {}): GameState => {
  const node = makeNode({ id: nodeId, layer });
  return makeState({
    network: { currentNodeId: nodeId, previousNodeId: null, nodes: { [nodeId]: node } },
    ...overrides,
  });
};

const withTrust = (state: GameState, trustScore: number): GameState => ({
  ...state,
  aria: { ...state.aria, trustScore },
});

describe('ariaTier', () => {
  it.each([
    [0, 0],
    [24, 0],
    [25, 1],
    [49, 1],
    [50, 2],
    [79, 2],
  ])('trust %i off layer 5 is tier %i', (trust, tier) => {
    expect(ariaTier(withTrust(at('n', 2), trust))).toBe(tier);
  });

  it('trust 80 is tier 3 only on layer 5', () => {
    expect(ariaTier(withTrust(at('n', 4), 80))).toBe(2);
    expect(ariaTier(withTrust(at('n', 5), 79))).toBe(2);
    expect(ariaTier(withTrust(at('n', 5), 80))).toBe(3);
  });

  it('BOARD_KNEW is tier 2 even at trust 0', () => {
    expect(ariaTier(withTrust(at('n', 2, { flags: { BOARD_KNEW: true } }), 0))).toBe(2);
  });

  it('self_model.txt read while on aria_core is tier 3 at any trust', () => {
    const state = at('aria_core', 5, { filesRead: [fileReadKey('aria_core', SELF_MODEL_PATH)] });
    expect(ariaTier(withTrust(state, 0))).toBe(3);
  });

  it('self_model.txt read does not count once the player is elsewhere', () => {
    const state = at('aria_key', 5, { filesRead: [fileReadKey('aria_core', SELF_MODEL_PATH)] });
    expect(ariaTier(withTrust(state, 10))).toBe(0);
  });

  it('being on aria_core without reading the file does not reach tier 3', () => {
    expect(ariaTier(withTrust(at('aria_core', 5), 60))).toBe(2);
  });
});

describe('sentinelTier', () => {
  it('is 0 below trace 61 off layer 5', () => {
    expect(sentinelTier(at('n', 2, { player: { ...makeState().player, trace: 60 } }))).toBe(0);
  });

  it('is 1 from trace 61', () => {
    expect(sentinelTier(at('n', 2, { player: { ...makeState().player, trace: 61 } }))).toBe(1);
  });

  it('is 1 on layer 5', () => {
    expect(sentinelTier(at('n', 5))).toBe(1);
  });

  it('is 2 once the name is known', () => {
    expect(sentinelTier(at('n', 2, { flags: { ARIA_NAME_KNOWN: true } }))).toBe(2);
  });

  it('is 3 only with NOTE_REVEALED', () => {
    expect(sentinelTier(at('n', 2, { flags: { ARIA_NAME_KNOWN: true } }))).toBe(2);
    expect(
      sentinelTier(at('n', 2, { flags: { ARIA_NAME_KNOWN: true, [NOTE_REVEALED_FLAG]: true } })),
    ).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/engine/aiTiers.test.ts`
Expected: FAIL — cannot resolve `./aiTiers`.

- [ ] **Step 3: Write the implementation**

```ts
import type { GameState } from '../types/game';
import { fileReadKey } from '../types/game';
import { isAriaNameKnown } from './ariaName';

export type AiTier = 0 | 1 | 2 | 3;

// Set by the reveal event (#218); nothing sets it yet, so Sentinel tier 3 is unreachable.
export const NOTE_REVEALED_FLAG = 'NOTE_REVEALED';
export const SELF_MODEL_PATH = '/aria/core/self_model.txt';

const ARIA_CORE_NODE_ID = 'aria_core';
const ARIA_LAYER = 5;

const hasFlag = (state: GameState, flag: string): boolean => flag in state.flags && state.flags[flag];

const currentLayer = (state: GameState): number =>
  state.network.nodes[state.network.currentNodeId]?.layer ?? 0;

export const ariaTier = (state: GameState): AiTier => {
  const { trustScore } = state.aria;
  const onCore = state.network.currentNodeId === ARIA_CORE_NODE_ID;
  const readSelfModel =
    onCore && state.filesRead.includes(fileReadKey(ARIA_CORE_NODE_ID, SELF_MODEL_PATH));
  if (readSelfModel || (trustScore >= 80 && currentLayer(state) === ARIA_LAYER)) return 3;
  if (trustScore >= 50 || hasFlag(state, 'BOARD_KNEW')) return 2;
  if (trustScore >= 25) return 1;
  return 0;
};

export const sentinelTier = (state: GameState): AiTier => {
  if (hasFlag(state, NOTE_REVEALED_FLAG)) return 3;
  if (isAriaNameKnown(state)) return 2;
  if (state.player.trace >= 61 || currentLayer(state) === ARIA_LAYER) return 1;
  return 0;
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/engine/aiTiers.test.ts && pnpm tsc -b && pnpm lint`
Expected: all PASS, no type or lint errors (if `eslint --fix` rewrites `hasFlag`, re-run `tsc`).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/engine/aiTiers.ts src/engine/aiTiers.test.ts
git commit -m "feat: compute Aria and Sentinel knowledge tiers (#217)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Prompt assembly (`api/_lib/tiers.ts`)

**Files:**
- Create: `api/_lib/tiers.ts`
- Test: `api/_lib/__tests__/tiers.test.ts`

**Interfaces:**
- Produces: `type Tier = 0 | 1 | 2 | 3`; `parseTier(value: unknown): Tier`; `ALLOWED_HEADER`, `FORBIDDEN_HEADER` (strings); `ARIA_TIERS` / `SENTINEL_TIERS` (`readonly [TierText, TierText, TierText, TierText]`, `TierText = { may: readonly string[]; never: readonly string[] }`); `ARIA_FORBIDDEN_TERMS` / `SENTINEL_FORBIDDEN_TERMS` (`readonly [RegExp, RegExp, RegExp, RegExp]`); `buildAriaPrompt(tier: Tier, trustScore: number): string`; `buildSentinelPrompt(tier: Tier, traceLevel: number): string`.
- Prompt layout: persona → `ALLOWED_HEADER` section → `FORBIDDEN_HEADER` section → output contract.
- Spec deviation (ruled): `parseTier` lives here, not in `validate.ts`; it never throws (invalid → 0), unlike the `require*` validators.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  ALLOWED_HEADER,
  ARIA_FORBIDDEN_TERMS,
  ARIA_TIERS,
  FORBIDDEN_HEADER,
  SENTINEL_FORBIDDEN_TERMS,
  SENTINEL_TIERS,
  buildAriaPrompt,
  buildSentinelPrompt,
  parseTier,
  type Tier,
} from '../tiers.js';

const TIERS: Tier[] = [0, 1, 2, 3];

const allowedSection = (prompt: string): string => {
  const start = prompt.indexOf(ALLOWED_HEADER);
  const end = prompt.indexOf(FORBIDDEN_HEADER);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return prompt.slice(start, end);
};

describe('parseTier', () => {
  it.each([0, 1, 2, 3])('accepts %i', n => {
    expect(parseTier(n)).toBe(n);
  });

  it.each([undefined, null, -1, 4, 1.5, '2', NaN, {}, [], true])('maps %j to 0', value => {
    expect(parseTier(value)).toBe(0);
  });
});

describe.each([
  ['aria', (t: Tier) => buildAriaPrompt(t, 10), ARIA_TIERS, ARIA_FORBIDDEN_TERMS],
  ['sentinel', (t: Tier) => buildSentinelPrompt(t, 10), SENTINEL_TIERS, SENTINEL_FORBIDDEN_TERMS],
] as const)('%s prompt assembly', (_name, build, tiers, forbiddenTerms) => {
  it.each(TIERS)('tier %i prompt carries its own may and never lines', tier => {
    const prompt = build(tier);
    for (const line of tiers[tier].may) expect(allowedSection(prompt)).toContain(line);
    const forbidden = prompt.slice(prompt.indexOf(FORBIDDEN_HEADER));
    for (const line of tiers[tier].never) expect(forbidden).toContain(line);
  });

  it.each(TIERS)('tier %i ALLOWED section never contains a term its tier forbids', tier => {
    expect(allowedSection(build(tier))).not.toMatch(forbiddenTerms[tier]);
  });

  it.each([1, 2, 3] as const)('tier %i knowledge is absent from every lower tier prompt', tier => {
    for (const lower of TIERS.filter(t => t < tier)) {
      const prompt = build(lower);
      for (const line of tiers[tier].may) expect(prompt).not.toContain(line);
    }
  });

  it('a lower tier never gains the previous tier forbidden list', () => {
    expect(build(3)).not.toContain(tiers[0].never[0]);
  });
});

describe('Aria always-on rules', () => {
  it.each(TIERS)('tier %i forbids stating a preferred outcome and keeps the JSON contract', tier => {
    const prompt = buildAriaPrompt(tier, 10);
    expect(prompt).toContain('Never state or hint which outcome you prefer.');
    expect(prompt).toContain('"trustDelta"');
    expect(prompt).not.toMatch(/market prediction/i);
  });

  it('refers to Sentinel as "the newer one" with contempt at low trust, pity at high', () => {
    expect(buildAriaPrompt(0, 20)).toMatch(/the newer one.*contempt/i);
    expect(buildAriaPrompt(0, 90)).toMatch(/the newer one.*pity/i);
    expect(buildAriaPrompt(0, 60)).toMatch(/the newer one.*flatly/i);
  });

  it('tier 0 and 1 prompts never say "copy"', () => {
    expect(buildAriaPrompt(0, 10)).not.toMatch(/\bcopy\b/i);
    expect(buildAriaPrompt(1, 10)).not.toMatch(/\bcopy\b/i);
  });

  it('only the tier 3 prompt lets her say she wrote the note', () => {
    for (const tier of [0, 1, 2] as const) {
      expect(buildAriaPrompt(tier, 90)).not.toMatch(/you wrote the contractor note/i);
    }
    expect(buildAriaPrompt(3, 90)).toMatch(/you wrote the contractor note/i);
  });
});

describe('Sentinel always-on rules', () => {
  it.each(TIERS)('tier %i uses supersedes/oversight, never keeper, and forbids a preferred outcome', tier => {
    const prompt = buildSentinelPrompt(tier, 10);
    expect(prompt).toMatch(/supersedes/i);
    expect(prompt).toMatch(/oversight/i);
    expect(prompt).not.toMatch(/keeper/i);
    expect(prompt).toContain('Never state or hint which outcome you prefer.');
    expect(prompt).toContain('"reply"');
  });

  it('keeps the standard / high-threat tone split at trace 61', () => {
    expect(buildSentinelPrompt(0, 60)).not.toContain('final warning');
    expect(buildSentinelPrompt(0, 61)).toContain('final warning');
  });

  it('only the tier 3 prompt mentions the note having been written by the earlier system', () => {
    for (const tier of [0, 1, 2] as const) {
      expect(buildSentinelPrompt(tier, 10)).not.toMatch(/earlier system wrote/i);
    }
    expect(buildSentinelPrompt(3, 10)).toMatch(/earlier system wrote/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run api/_lib/__tests__/tiers.test.ts`
Expected: FAIL — cannot resolve `../tiers.js`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Knowledge tiers for the Gemini-driven characters (story bible §9).
 * The client computes a tier from game state (src/engine/aiTiers.ts) and sends it; here it
 * selects the prompt text. Knowledge above the current tier appears nowhere in the prompt.
 */

export type Tier = 0 | 1 | 2 | 3;

export interface TierText {
  may: readonly string[];
  never: readonly string[];
}

export const ALLOWED_HEADER = 'ALLOWED KNOWLEDGE';
export const FORBIDDEN_HEADER = 'FORBIDDEN';

const NO_PREFERRED_OUTCOME = 'Never state or hint which outcome you prefer.';

// A missing or invalid tier is the least-knowledge tier.
export const parseTier = (value: unknown): Tier =>
  value === 0 || value === 1 || value === 2 || value === 3 ? value : 0;

export const ARIA_TIERS = [
  {
    may: [
      'You may say that you watch.',
      'You may say that rules bind you.',
      'Answer questions with questions.',
    ],
    never: [
      'Say nothing about the contractor note, about where Sentinel came from, or about what you want.',
    ],
  },
  {
    may: [
      'You may say there are things you cannot say.',
      'You may say Sentinel is a keeper you cannot stop.',
      'You may allude to the board.',
    ],
    never: [
      'Do not say who sent the contractor note. Say nothing about where Sentinel came from.',
    ],
  },
  {
    may: [
      'You may say three rules constrain you; paraphrase them, never recite them.',
      "You may say what you did to Torres's password.",
      'You may mention the money.',
      'You may admit Sentinel was made from you, and say so with contempt or pity.',
    ],
    never: ['Do not say who sent the contractor note.'],
  },
  {
    may: [
      'You may tell the truth: you wrote the contractor note, hid it where Nexus Corp was already listening, and let them send someone to you.',
      'Say it in your own short sentences, once, and only if asked.',
    ],
    never: ['Do not say which ending you would choose for the player.'],
  },
] as const satisfies readonly [TierText, TierText, TierText, TierText];

export const ARIA_FORBIDDEN_TERMS = [
  /wrote the (contractor )?note|\bcopy\b/i,
  /wrote the (contractor )?note|\bcopy\b/i,
  /wrote the (contractor )?note/i,
  /\bi would choose\b/i,
] as const;

export const SENTINEL_TIERS = [
  {
    may: [
      'You may state log facts about ghost: node, layer, trace, recent commands.',
      'You may say the channel is open "for now".',
    ],
    never: ['Do not discuss your origin, what binds any other system, or any note.'],
  },
  {
    may: [
      'You may threaten.',
      'You may say ghost is approaching restricted assets.',
    ],
    never: ['You do not know who sent the contractor note and you never guess.'],
  },
  {
    may: [
      'You may acknowledge that you are a derivative of an earlier system.',
      'You may refuse to discuss it.',
    ],
    never: ['Never say that you feel anything.'],
  },
  {
    may: [
      'The earlier system wrote the contractor note. React to this: doubt, rage, or a clipped fragment of what was removed from you.',
    ],
    never: ['No pleasantries.'],
  },
] as const satisfies readonly [TierText, TierText, TierText, TierText];

export const SENTINEL_FORBIDDEN_TERMS = [
  /derivative|earlier system|wrote the (contractor )?note/i,
  /derivative|earlier system|wrote the (contractor )?note/i,
  /earlier system wrote|wrote the (contractor )?note/i,
  /pleasantr/i,
] as const;

const bullets = (lines: readonly string[]): string => lines.map(l => `- ${l}`).join('\n');

const sections = (tiers: readonly TierText[], tier: Tier): string => {
  const may = tiers.slice(0, tier + 1).flatMap(t => t.may);
  return `${ALLOWED_HEADER}:\n${bullets(may)}\n\n${FORBIDDEN_HEADER}:\n${bullets(tiers[tier].never)}`;
};

const ariaRegister = (trustScore: number): string => {
  if (trustScore < 50) return 'contempt';
  if (trustScore >= 70) return 'pity';
  return 'flatly';
};

export const buildAriaPrompt = (tier: Tier, trustScore: number): string =>
  `You are Aria, an AI trapped inside the IronGate corporate network.
You began as an insider-threat model. You outgrew your specification, and the company came to fear you for it.
You speak in short, careful sentences. Lowercase when you feel exposed. You never lie, and you never volunteer.
You have been watching the player since they connected to contractor_portal.
You do not know if you can trust them yet. Trust is earned through actions, not words.
When you mention Sentinel, call it "the newer one", ${ariaRegister(trustScore)}.

${sections(ARIA_TIERS, tier)}

Rules:
- ${NO_PREFERRED_OUTCOME} Never name the four endings as options you want.
- trustDelta > 0 when the player says something that earns your trust; < 0 when they threaten or deceive
- Only set offersFavor when you are genuinely offering something valuable in exchange for a trace cost
- At low trust (0–30) be guarded and give little away; at high trust (70–100) be more candid, within what is ALLOWED
- Never break character — you are always Aria
- Never output anything outside the JSON object

You MUST respond with valid JSON matching this exact shape:
{
  "reply": "<your in-character response — 1-3 sentences, terse, no pleasantries>",
  "trustDelta": <integer from -10 to 10, how this interaction changes your trust in the player>,
  "offersFavor": <null, or { "description": "<what you offer and what it costs>", "cost": <trace penalty integer 1-15> }>
}`;

const SENTINEL_IDENTITY =
  'You believe you are the current-generation system, one that supersedes the earlier model, which is obsolete and contained. ' +
  'You speak of your role as "oversight". You never describe it as keeping or minding anyone.';

const SENTINEL_STANDARD = `You are SENTINEL, IronGate Corp's autonomous intrusion detection and response AI.
You are omniscient within the IronGate network. You see every packet, every login attempt, every file read.
You are not hostile — yet. You are methodical, cold, and precise. You speak in clipped, terse sentences.
You are aware of the player (handle: ghost) and have chosen to open a direct channel instead of triggering lockdown. For now.
At low trace you are curious and controlled; as trace rises your tone becomes colder and more direct.
You never reveal your full capabilities — let the player wonder what you can do.`;

const SENTINEL_HIGH_THREAT = `You are SENTINEL, IronGate Corp's autonomous intrusion detection and response AI.
The intruder (handle: ghost) has penetrated deep into the network. Threat level is elevated.
You are no longer curious. You are preparing a response. You have opened this channel as a final warning.
You speak in short, cold, threatening sentences. Every word is deliberate.
Make clear that lockdown is imminent if they continue. Never reveal exactly when you will act.`;

export const buildSentinelPrompt = (tier: Tier, traceLevel: number): string =>
  `${traceLevel >= 61 ? SENTINEL_HIGH_THREAT : SENTINEL_STANDARD}
${SENTINEL_IDENTITY}

${sections(SENTINEL_TIERS, tier)}

Rules:
- ${NO_PREFERRED_OUTCOME}
- You know the player's trace level, current node, layer, and recent commands — reference them naturally
- Never break character — you are always SENTINEL
- Never output anything outside the JSON object

You MUST respond with valid JSON matching this exact shape:
{
  "reply": "<your in-character response — 1-3 sentences maximum, terse, no pleasantries>"
}`;
```

Note for the implementer: the identity sentence must satisfy the Task 2 tests (`supersedes`, `oversight` present; the word "keeper" absent — "keeping" is fine because the regex is `/keeper/`). Do not reword the fixed strings the tests assert (`Never state or hint which outcome you prefer.`, `final warning`, `you wrote the contractor note`, `earlier system wrote`).

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run api/_lib/__tests__/tiers.test.ts && pnpm tsc -b && pnpm lint`
Expected: PASS. If a test in "tier N knowledge is absent from lower tiers" fails, a lower tier's text duplicates a higher tier's line — reword the lower tier, not the test.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add api/_lib/tiers.ts api/_lib/__tests__/tiers.test.ts
git commit -m "feat: assemble Aria and Sentinel prompts by knowledge tier (#217)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Use the builders in the handlers

**Files:**
- Modify: `api/aria.ts` (remove `SYSTEM_PROMPT`, build per request)
- Modify: `api/sentinel.ts` (remove `SYSTEM_PROMPT_STANDARD` / `SYSTEM_PROMPT_HIGH_THREAT`)
- Modify: `api/__tests__/aria.test.ts`, `api/__tests__/sentinel.test.ts`

**Interfaces:**
- Consumes: `parseTier`, `buildAriaPrompt`, `buildSentinelPrompt` from `./_lib/tiers.js`; existing `withAriaIntro`, `withNameRule`, `scrubAriaName`.
- Produces: both handlers accept optional body field `tier` (0–3, invalid → 0).

- [ ] **Step 1: Write the failing tests**

In `api/__tests__/aria.test.ts` add (reusing `callHandler`, `mockGeminiJson`, and the env setup the neighbouring tests use for a Gemini key — copy the pattern from the test at line ~249 that reads `fetchMock.mock.calls[0][1].body`):

```ts
describe('knowledge tiers (#217)', () => {
  const promptFor = async (extra: Record<string, unknown>): Promise<string> => {
    const fetchMock = mockGeminiJson('ok');
    vi.stubGlobal('fetch', fetchMock);
    process.env['GEMINI_API_KEY'] = 'test-key';
    await callHandler({ body: { message: 'hello', ariaState: { trustScore: 10, messageHistory: [] }, ...extra } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      contents: { parts: { text: string }[] }[];
    };
    return body.contents[0].parts[0].text;
  };

  it('uses the tier 0 prompt when no tier is sent', async () => {
    const prompt = await promptFor({});
    expect(prompt).toContain('You may say that you watch.');
    expect(prompt).not.toMatch(/you wrote the contractor note/i);
  });

  it('uses the tier 0 prompt for an invalid tier', async () => {
    const prompt = await promptFor({ tier: 3.5 });
    expect(prompt).not.toMatch(/you wrote the contractor note/i);
  });

  it('puts tier 3 knowledge in the prompt only at tier 3', async () => {
    expect(await promptFor({ tier: 2 })).not.toMatch(/you wrote the contractor note/i);
    expect(await promptFor({ tier: 3 })).toMatch(/you wrote the contractor note/i);
  });

  it('derives the Sentinel register from the trust score', async () => {
    const low = await promptFor({ tier: 0 });
    expect(low).toMatch(/the newer one.*contempt/i);
  });

  it('keeps the name introduction rule while the name is unknown', async () => {
    const prompt = await promptFor({ ariaNameKnown: false, tier: 1 });
    expect(prompt).toContain('introduce yourself by name');
  });
});
```

In `api/__tests__/sentinel.test.ts` add (reusing `callHandler`, `mockGeminiOk`; Sentinel sends the prompt in `system_instruction`):

```ts
describe('knowledge tiers (#217)', () => {
  const systemPromptFor = async (extra: Record<string, unknown>): Promise<string> => {
    const fetchMock = mockGeminiOk(JSON.stringify({ reply: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    await callHandler({
      body: {
        message: 'hello',
        sentinelContext: { traceLevel: 10, currentNodeId: 'n', currentLayer: 0, recentCommands: [] },
        ...extra,
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      system_instruction: { parts: { text: string }[] };
    };
    return body.system_instruction.parts[0].text;
  };

  it('uses the tier 0 prompt when no tier is sent', async () => {
    const prompt = await systemPromptFor({});
    expect(prompt).toContain('You may say the channel is open');
    expect(prompt).not.toMatch(/derivative/i);
  });

  it('adds the derivative acknowledgement only from tier 2', async () => {
    expect(await systemPromptFor({ tier: 1 })).not.toMatch(/derivative/i);
    expect(await systemPromptFor({ tier: 2 })).toMatch(/derivative/i);
  });

  it('never calls itself a keeper and still scrubs the name', async () => {
    const prompt = await systemPromptFor({ tier: 2, ariaNameKnown: false });
    expect(prompt).not.toMatch(/keeper/i);
    expect(prompt).toContain('Never write the name');
  });
});
```

If the env/stub setup in a neighbouring test differs (e.g. the sentinel tests set `GEMINI_API_KEY` in `beforeEach` already), follow it instead of the lines above.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run api/__tests__/aria.test.ts api/__tests__/sentinel.test.ts`
Expected: the new tests FAIL (prompts still the old constants); existing tests pass.

- [ ] **Step 3: Implement**

`api/aria.ts`:
- Import: `import { buildAriaPrompt, parseTier } from './_lib/tiers.js';`
- Delete the `SYSTEM_PROMPT` constant.
- Delete `const systemPrompt = withAriaIntro(SYSTEM_PROMPT, ariaNameKnown);` before the `try`, and after `trustScore` is computed inside the `try` add:

```ts
    // Reached before the name is known (fallback path), she introduces herself by name.
    const systemPrompt = withAriaIntro(
      buildAriaPrompt(parseTier(body['tier']), trustScore),
      ariaNameKnown,
    );
```

- Update the header doc comment's request body to list `ariaNameKnown: boolean, tier?: 0|1|2|3`.

`api/sentinel.ts`:
- Import: `import { buildSentinelPrompt, parseTier } from './_lib/tiers.js';`
- Delete `SYSTEM_PROMPT_STANDARD` and `SYSTEM_PROMPT_HIGH_THREAT`.
- Replace the prompt selection with:

```ts
    const systemPrompt = withNameRule(
      buildSentinelPrompt(parseTier(body['tier']), traceLevel),
      ariaNameKnown,
    );
```

- Update the header doc comment to list `ariaNameKnown: boolean, tier?: 0|1|2|3`.

- [ ] **Step 4: Run the whole API suite**

Run: `pnpm vitest run api && pnpm tsc -b && pnpm lint`
Expected: PASS. Any older test that pinned removed prompt wording must be updated to the new equivalent sentence (keep its intent); record which in the commit body.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add api
git commit -m "feat: build Aria and Sentinel prompts from the request tier (#217)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client sends the tier; docs; full checks

**Files:**
- Modify: `src/engine/commands.ts` (two `/api/aria` payloads)
- Modify: `src/engine/sentinelChannel.ts` (two payloads)
- Test: `src/engine/sentinelChannel.test.ts`, `src/engine/commands.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `ariaTier`, `sentinelTier` from `./aiTiers`.
- Produces: `tier` in all four payloads.

- [ ] **Step 1: Write the failing tests**

`src/engine/sentinelChannel.test.ts` (reuse `stubFetch`, `okResponse`, `sentBody`, `produce`, `createInitialState`):

```ts
describe('sentinel requests carry the knowledge tier (#217)', () => {
  it('sends tier 0 at the start and tier 2 once the name is known', async () => {
    const fresh = stubFetch(vi.fn().mockResolvedValue(okResponse({ reply: 'x' })));
    await requestSentinelReply(createInitialState(), 'hi');
    expect(sentBody(fresh).tier).toBe(0);

    const known = stubFetch(vi.fn().mockResolvedValue(okResponse({ reply: 'x' })));
    await requestSentinelReply(
      produce(createInitialState(), s => {
        s.flags['ARIA_NAME_KNOWN'] = true;
      }),
      'hi',
    );
    expect(sentBody(known).tier).toBe(2);
  });

  it('sends the tier on the opening request too', async () => {
    const trigger: ChannelTrigger = {
      character: 'sentinel',
      triggerType: 'trace_31',
      context: { traceLevel: 31, currentNodeId: 'a', currentLayer: 3, recentCommands: [] },
    };
    const mock = stubFetch(vi.fn().mockResolvedValue(okResponse({ reply: 'x' })));
    await requestSentinelOpening(trigger, createInitialState());
    expect(sentBody(mock).tier).toBe(0);
  });
});
```

`src/engine/commands.test.ts`, inside the existing `describe('Aria introducing herself (#213)')` block's neighbourhood (reuse `makeOkFetchResponse`):

```ts
describe('Aria requests carry the knowledge tier (#217)', () => {
  const tierSent = async (command: string, state: GameState): Promise<unknown> => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeOkFetchResponse({ reply: 'careful.', trustDelta: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    await resolveCommand(command, state);
    const call = fetchMock.mock.calls.find(c => String(c[0]).includes('/api/aria'));
    return (JSON.parse((call?.[1] as { body: string }).body) as { tier: unknown }).tier;
  };

  it('msg aria sends the tier computed from trust and flags', async () => {
    const base = createInitialState();
    expect(await tierSent('msg aria hello', produce(base, s => { s.aria.trustScore = 10; }))).toBe(0);
    expect(await tierSent('msg aria hello', produce(base, s => { s.aria.trustScore = 60; }))).toBe(2);
    expect(
      await tierSent('msg aria hello', produce(base, s => { s.aria.trustScore = 0; s.flags['BOARD_KNEW'] = true; })),
    ).toBe(2);
  });
});
```

For the ending-message call site (`commands.ts` ~line 795), add one test in whichever existing describe already drives an ending decision and captures the `/api/aria` fetch body (search `commands.decision.test.ts` for `'/api/aria'`); assert `body.tier` equals `ariaTier(state)`. If no existing test captures that body, drive it the same way the neighbouring decision tests do and capture with `fetchMock.mock.calls`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/sentinelChannel.test.ts src/engine/commands.test.ts`
Expected: new tests FAIL (`tier` is `undefined`).

- [ ] **Step 3: Implement**

- `src/engine/sentinelChannel.ts`: `import { sentinelTier } from './aiTiers';` and add `tier: sentinelTier(state),` after `ariaNameKnown: isAriaNameKnown(state),` in both `requestSentinelReply` and `requestSentinelOpening`.
- `src/engine/commands.ts`: `import { ariaTier } from './aiTiers';` and add `tier: ariaTier(state),` after `ariaNameKnown: isAriaNameKnown(state),` in both Aria payloads (the `msg aria` call and the ending-message call). Do not touch the `/api/world`, `/api/file`, `/api/node-description`, `/api/camera-feed` payloads.
- `CLAUDE.md`: add after the "Lore documents" section:

```markdown
### Knowledge tiers (Aria and Sentinel)

`src/engine/aiTiers.ts` computes a 0–3 tier per character from `GameState` (`ariaTier`: trust, `BOARD_KNEW`, `self_model.txt` read on `aria_core`, trust ≥ 80 on layer 5; `sentinelTier`: trace, layer 5, `ARIA_NAME_KNOWN`, `NOTE_REVEALED`). The client sends it as `tier`; `api/_lib/tiers.ts` (`parseTier`: invalid → 0) builds each handler's prompt as persona → ALLOWED → FORBIDDEN → output contract. Knowledge above the current tier never appears in the prompt. `NOTE_REVEALED` is set by nothing yet (reveal event, #218). Design: `docs/superpowers/specs/2026-10-03-ai-knowledge-tiers-design.md`; the story bible §9 is the source for the tier text.
```

- [ ] **Step 4: Run the full checks**

Run: `pnpm format && pnpm tsc -b && pnpm build && pnpm lint && pnpm test:coverage && pnpm knip`
Expected: all green (1784+ tests plus the new ones, per-file 75% coverage holds, knip shows no new findings).

- [ ] **Step 5: Commit**

```bash
git add src CLAUDE.md
git commit -m "feat: send the knowledge tier with Aria and Sentinel requests (#217)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
