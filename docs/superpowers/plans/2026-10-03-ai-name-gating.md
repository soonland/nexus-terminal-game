# Gate the Gemini Prompts on the Name Flag (#213) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Until `ARIA_NAME_KNOWN` is set, no AI handler may output the name "Aria": every request carries the flag, every prompt forbids the name, and every response is scrubbed as a safety net. Aria herself is the exception: reached early (the fallback path), she introduces herself, and that introduction sets the flag.

**Architecture:** A small shared module in `api/_lib/` provides the flag validator, the prompt rule and the scrubber. Each handler validates `ariaNameKnown`, appends the rule to its prompt when the name is unknown, and scrubs the text fields it returns. On the client, every request includes `ariaNameKnown: isAriaNameKnown(state)`; the world AI can no longer set the protected flag through `flagsSet`; and Aria's reply marks the flag only when it actually contains her name.

**Tech Stack:** TypeScript, Hono handlers in `api/`, Vitest.

**Spec / issue:** `docs/story-bible.md` §9 ("Name rule for every prompt"); GitHub issue #213. Builds on #211/#212 (`src/engine/ariaName.ts`).

## Global Constraints

- **Required flag:** `ariaNameKnown` must be a boolean in every handler's request body (`world`, `file`, `node-description`, `camera-feed`, `sentinel`, `aria`). A missing or non-boolean value is a 400. Validate it **after** the existing field checks so every existing error message stays the same.
- **Scrub rule:** only when the flag is `false`, replace `/\baria\b/gi` in returned text with `CASSANDRA` / `Cassandra` / `cassandra` (matching the case of the match: all-caps → `CASSANDRA`; leading capital → `Cassandra`; otherwise `cassandra`). When `true`, responses are untouched. Never scrub flag *keys* (`flagsSet`), only human-readable text.
- **Prompt rule text** (appended to the system prompt when the flag is `false`): `Never write the name "Aria" in your output. The project and the entity behind it are called CASSANDRA, or "the restricted subnet".`
- **Aria is the one exception:** her handler does not scrub her reply. When the flag is `false` her prompt adds `You have not told the player your name yet. In this reply, introduce yourself by name once, briefly (for example: "I am Aria.").`
- **Protected flag:** the world AI's `flagsSet` must never be able to set `ARIA_NAME_KNOWN` (it is ignored). The flag is set only by the engine (`markAriaNameKnown`).
- `SAVE_VERSION` unchanged; no `GameState` shape change.
- Style: arrow functions only, semicolons, single quotes, trailing commas, 100-col; `eslint --fix` runs on commit and strips casts it judges unnecessary (prefer generics / typed values), and `no-unnecessary-condition` rejects `??` on non-nullable types: run `pnpm tsc -b` and `pnpm lint` before committing.
- API handler imports use the `.js` suffix (`'./_lib/validate.js'`).
- Pre-commit checks, in order, before every commit: `pnpm format`, `pnpm tsc -b`, `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip`. Per-file coverage must stay ≥ 75%.
- Commit messages: Conventional Commits, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A model reply that leaks the name ("Aria", "ARIA", "aria") is scrubbed in **every** returned text field before reaching the player, for all five scrubbed handlers, in all casings. (Tasks 2, 3)
- With the flag `true` nothing is altered (including words that merely contain "aria", e.g. "malaria", "Ariadne", `aria_core`, which must never be rewritten even when the flag is `false`). (Task 1)
- The AI cannot flip the secret itself: `flagsSet: { ARIA_NAME_KNOWN: true }` from the world AI does nothing. (Task 4)
- Aria's introduction sets the flag only when the reply really contains her name, not on a fallback reply, an error, or an unrelated reply. (Task 4)
- Every client call site sends the flag (including the second `/api/world` call used by `exploit`, the ending call to `/api/aria`, and Sentinel's opening/reply calls). (Task 4)
- Engine-generated Aria lines (`// ARIA OFFER`, `// ARIA: Agreement logged.` …) do not say the name while it is unknown. (Task 4)

## File Structure

- **Create** `api/_lib/ariaName.ts` (+ `api/_lib/__tests__/ariaName.test.ts`) — rule text, `withNameRule`, `scrubAriaName`.
- **Modify** `api/_lib/validate.ts` (+ its test) — `requireBoolean`.
- **Modify** `api/world.ts`, `api/file.ts`, `api/node-description.ts`, `api/camera-feed.ts`, `api/sentinel.ts`, `api/aria.ts` and their tests under `api/__tests__/`.
- **Modify** `src/engine/commands.ts`, `src/engine/sentinelChannel.ts` (+ tests) — send the flag, protect it, mark on introduction, neutral engine tags.
- **Modify** `CLAUDE.md`.

---

### Task 1: Shared helpers

**Files:**
- Create: `api/_lib/ariaName.ts`, `api/_lib/__tests__/ariaName.test.ts`
- Modify: `api/_lib/validate.ts`; extend the existing validate test file in `api/_lib/__tests__/` (find it with `ls api/_lib/__tests__`).

**Interfaces:**
- Produces: `requireBoolean(value: unknown, field: string): boolean` (throws `ValidationError` with message `Missing or non-boolean field: <field>`); `NAME_RULE: string`; `ARIA_INTRO_RULE: string`; `withNameRule(prompt: string, known: boolean): string`; `withAriaIntro(prompt: string, known: boolean): string`; `scrubAriaName(text: string, known: boolean): string`.

- [ ] **Step 1: Write the failing tests**

`api/_lib/__tests__/ariaName.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ARIA_INTRO_RULE,
  NAME_RULE,
  scrubAriaName,
  withAriaIntro,
  withNameRule,
} from '../ariaName.js';

describe('scrubAriaName', () => {
  it('replaces the name in any casing while the name is unknown', () => {
    expect(scrubAriaName('Aria is watching. ARIA knows. aria?', false)).toBe(
      'Cassandra is watching. CASSANDRA knows. cassandra?',
    );
  });

  it('keeps mixed-case matches readable', () => {
    expect(scrubAriaName('aRIA', false)).toBe('cassandra');
  });

  it('leaves text untouched once the name is known', () => {
    expect(scrubAriaName('Aria is watching.', true)).toBe('Aria is watching.');
  });

  it('only rewrites the whole word', () => {
    const text = 'malaria, Ariadne, variable, aria_core, ariana';
    expect(scrubAriaName(text, false)).toBe(text);
  });

  it('rewrites the word next to punctuation and inside hyphenated codes', () => {
    expect(scrubAriaName('"Aria," he said. PROJ-ARIA-INFRA (aria)', false)).toBe(
      '"Cassandra," he said. PROJ-CASSANDRA-INFRA (cassandra)',
    );
  });

  it('handles empty text', () => {
    expect(scrubAriaName('', false)).toBe('');
  });
});

describe('prompt rules', () => {
  it('appends the name rule only while the name is unknown', () => {
    expect(withNameRule('PROMPT', false)).toBe(`PROMPT\n\n${NAME_RULE}`);
    expect(withNameRule('PROMPT', true)).toBe('PROMPT');
    expect(NAME_RULE).toContain('CASSANDRA');
    expect(NAME_RULE).toContain('Never write the name "Aria"');
  });

  it('appends the introduction rule for Aria only while the name is unknown', () => {
    expect(withAriaIntro('PROMPT', false)).toBe(`PROMPT\n\n${ARIA_INTRO_RULE}`);
    expect(withAriaIntro('PROMPT', true)).toBe('PROMPT');
    expect(ARIA_INTRO_RULE).toContain('introduce yourself by name');
  });
});
```

Add to the existing validate test file (adapt the import path/style to match it):

```ts
describe('requireBoolean', () => {
  it('returns real booleans, including false', () => {
    expect(requireBoolean(true, 'flag')).toBe(true);
    expect(requireBoolean(false, 'flag')).toBe(false);
  });

  it.each([undefined, null, 'true', 1, 0, {}, []])('rejects %j', value => {
    expect(() => requireBoolean(value, 'ariaNameKnown')).toThrow(ValidationError);
    expect(() => requireBoolean(value, 'ariaNameKnown')).toThrow(
      'Missing or non-boolean field: ariaNameKnown',
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run api/_lib`
Expected: FAIL — `../ariaName.js` not found; `requireBoolean` not exported.

- [ ] **Step 3: Implement**

Append to `api/_lib/validate.ts`:

```ts
export const requireBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`Missing or non-boolean field: ${field}`);
  }
  return value;
};
```

`api/_lib/ariaName.ts`:

```ts
/**
 * The name "Aria" stays hidden until the player learns it (ARIA_NAME_KNOWN). Every AI
 * handler tells its model not to say it, and scrubs the output as a safety net.
 */

export const NAME_RULE =
  'Never write the name "Aria" in your output. The project and the entity behind it are ' +
  'called CASSANDRA, or "the restricted subnet".';

// Aria herself is the exception: reached early, she introduces herself (which sets the flag).
export const ARIA_INTRO_RULE =
  'You have not told the player your name yet. In this reply, introduce yourself by name ' +
  'once, briefly (for example: "I am Aria.").';

export const withNameRule = (prompt: string, known: boolean): string =>
  known ? prompt : `${prompt}\n\n${NAME_RULE}`;

export const withAriaIntro = (prompt: string, known: boolean): string =>
  known ? prompt : `${prompt}\n\n${ARIA_INTRO_RULE}`;

const matchCase = (match: string): string => {
  if (match === match.toUpperCase()) return 'CASSANDRA';
  return match[0] === match[0].toUpperCase() ? 'Cassandra' : 'cassandra';
};

export const scrubAriaName = (text: string, known: boolean): string =>
  known ? text : text.replace(/\baria\b/gi, matchCase);
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run api/_lib && pnpm tsc -b`
Expected: PASS. (If `tsconfig.api.json` is a separate project referenced by `tsc -b`, the build covers it; otherwise also run `pnpm exec tsc -p tsconfig.api.json --noEmit`.)

- [ ] **Step 5: Commit**

```bash
git add api/_lib
git commit -m "feat: add shared name-rule helpers for the AI handlers (#213)"
```

---

### Task 2: world, file, node-description and camera-feed handlers

**Files:**
- Modify: `api/world.ts`, `api/file.ts`, `api/node-description.ts`, `api/camera-feed.ts`
- Test: `api/__tests__/world.test.ts`, `file.test.ts`, `node-description.test.ts`, `camera.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- Behaviour per handler: parse `ariaNameKnown` with `requireBoolean` inside the existing validation `try`, **after** the existing field checks; append `withNameRule` to the prompt; scrub the returned text fields. Scrubbed fields: `world` → `narrative` and each `suggestions[]` entry; `file` → `content`; `node-description` → `description`; `camera-feed` → `description`. Fallback strings are returned as-is (they contain no name).
- `file.ts` / `node-description.ts` wording: when the name is unknown, the "planted by an AI called Aria" / "influenced by an AI called Aria" instruction says **"an unknown entity (cover name CASSANDRA)"** instead; when known, the existing wording is unchanged.

- [ ] **Step 1: Update the existing test helpers and write the failing tests**

In each of the four test files, make `callHandler` send `ariaNameKnown: true` by default for plain-object bodies, so every existing test keeps its meaning (a test can still omit it by passing `ariaNameKnown: undefined`, which `JSON.stringify` drops). Replace `init.body = JSON.stringify(body);` with:

```ts
    init.body = JSON.stringify(withFlag(body));
```

and add above `callHandler` in each file:

```ts
const withFlag = (body: unknown): unknown =>
  typeof body === 'object' && body !== null && !Array.isArray(body)
    ? { ariaNameKnown: true, ...body }
    : body;
```

(For `world.test.ts`, `VALID_BODY` is used by many tests: leave it untouched — the helper adds the flag.)

Append to `api/__tests__/world.test.ts` (it already has `VALID_BODY`, `VALID_AI_JSON`, `makeGeminiResponse`, `callHandler`):

```ts
describe('POST /api/world — name rule', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  it.each([undefined, 'yes', 1, null])('returns 400 for ariaNameKnown = %j', async flag => {
    const res = await callHandler({ body: { ...VALID_BODY, ariaNameKnown: flag } });
    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('ariaNameKnown');
  });

  it('keeps the existing error for a missing command ahead of the flag error', async () => {
    const res = await callHandler({ body: { ariaNameKnown: undefined } });
    expect((res._json as { error: string }).error).toContain('command');
  });

  it('tells the model not to say the name, and scrubs a leaking reply, while the name is unknown', async () => {
    const leaking = {
      ...VALID_AI_JSON,
      narrative: 'Aria is watching you.',
      suggestions: ['msg ARIA', 'scan', 'ask aria'],
    };
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse(JSON.stringify(leaking)));
    vi.stubGlobal('fetch', fetchMock);

    const res = await callHandler({ body: { ...VALID_BODY, ariaNameKnown: false } });

    const sent = JSON.stringify(fetchMock.mock.calls[0][1]);
    expect(sent).toContain('Never write the name');
    const json = res._json as { narrative: string; suggestions: string[] };
    expect(json.narrative).toBe('Cassandra is watching you.');
    expect(json.suggestions).toEqual(['msg CASSANDRA', 'scan', 'ask cassandra']);
  });

  it('leaves the prompt and the reply untouched once the name is known', async () => {
    const reply = { ...VALID_AI_JSON, narrative: 'Aria is watching you.' };
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse(JSON.stringify(reply)));
    vi.stubGlobal('fetch', fetchMock);

    const res = await callHandler({ body: { ...VALID_BODY, ariaNameKnown: true } });

    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('Never write the name');
    expect((res._json as { narrative: string }).narrative).toBe('Aria is watching you.');
  });

  it('does not scrub flag keys in flagsSet', async () => {
    const reply = { ...VALID_AI_JSON, flagsSet: { ARIA_SEEN: true } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeGeminiResponse(JSON.stringify(reply))));
    const res = await callHandler({ body: { ...VALID_BODY, ariaNameKnown: false } });
    expect((res._json as { flagsSet: Record<string, boolean> }).flagsSet).toEqual({
      ARIA_SEEN: true,
    });
  });
});
```

Append to `api/__tests__/file.test.ts` (mock a Gemini response in the shape the existing tests use for a successful file generation — copy the mock from the nearest existing "success" test in that file, call it `okGemini(text)` below):

```ts
describe('POST /api/file — name rule', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  const okGemini = (text: string) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text }] } }] }),
    });

  const body = (extra: Record<string, unknown>) => ({
    nodeId: 'node-alpha',
    fileName: 'notes.txt',
    ...extra,
  });

  it.each([undefined, 'yes', 1])('returns 400 for ariaNameKnown = %j', async flag => {
    const res = await callHandler({ body: body({ ariaNameKnown: flag }) });
    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('ariaNameKnown');
  });

  it('scrubs a leaking file while the name is unknown and adds the rule to the prompt', async () => {
    const fetchMock = okGemini('Memo: ask Aria about ARIA.');
    vi.stubGlobal('fetch', fetchMock);
    const res = await callHandler({ body: body({ ariaNameKnown: false }) });
    expect((res._json as { content: string }).content).toBe('Memo: ask Cassandra about CASSANDRA.');
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain('Never write the name');
  });

  it('keeps the file untouched once the name is known', async () => {
    vi.stubGlobal('fetch', okGemini('Memo: ask Aria.'));
    const res = await callHandler({ body: body({ ariaNameKnown: true }) });
    expect((res._json as { content: string }).content).toBe('Memo: ask Aria.');
  });

  it('describes the planter as an unknown entity until the name is known', async () => {
    const fetchMock = okGemini('x');
    vi.stubGlobal('fetch', fetchMock);
    await callHandler({ body: body({ ariaNameKnown: false, ariaPlanted: true }) });
    const unknownPrompt = JSON.stringify(fetchMock.mock.calls[0][1]);
    expect(unknownPrompt).toContain('an unknown entity (cover name CASSANDRA)');
    expect(unknownPrompt).not.toContain('an AI called Aria');

    const knownMock = okGemini('x');
    vi.stubGlobal('fetch', knownMock);
    await callHandler({ body: body({ ariaNameKnown: true, ariaPlanted: true }) });
    expect(JSON.stringify(knownMock.mock.calls[0][1])).toContain('an AI called Aria');
  });
});
```

Append to `api/__tests__/node-description.test.ts` (uses its `DEFAULT_BODY`; same `okGemini` helper pattern, returning `{ description }`-shaped text):

```ts
describe('POST /api/node-description — name rule', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  const okGemini = (text: string) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text }] } }] }),
    });

  it.each([undefined, 'yes', 1])('returns 400 for ariaNameKnown = %j', async flag => {
    const res = await callHandler({ body: { ...DEFAULT_BODY, ariaNameKnown: flag } });
    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('ariaNameKnown');
  });

  it('scrubs a leaking description and adds the rule to the prompt while the name is unknown', async () => {
    const fetchMock = okGemini('You sense Aria here.');
    vi.stubGlobal('fetch', fetchMock);
    const res = await callHandler({ body: { ...DEFAULT_BODY, ariaNameKnown: false } });
    expect((res._json as { description: string }).description).toBe('You sense Cassandra here.');
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain('Never write the name');
  });

  it('keeps the description untouched once the name is known', async () => {
    vi.stubGlobal('fetch', okGemini('You sense Aria here.'));
    const res = await callHandler({ body: { ...DEFAULT_BODY, ariaNameKnown: true } });
    expect((res._json as { description: string }).description).toBe('You sense Aria here.');
  });

  it('names the influence as an unknown entity until the name is known', async () => {
    const fetchMock = okGemini('x');
    vi.stubGlobal('fetch', fetchMock);
    await callHandler({ body: { ...DEFAULT_BODY, ariaInfluence: 0.5, ariaNameKnown: false } });
    const prompt = JSON.stringify(fetchMock.mock.calls[0][1]);
    expect(prompt).toContain('an unknown entity (cover name CASSANDRA)');
    expect(prompt).not.toContain('an AI called Aria');
  });
});
```

Append to `api/__tests__/camera.test.ts` (use its valid body shape `{ cameraId, location }`; same `okGemini` helper):

```ts
describe('POST /api/camera-feed — name rule', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  const okGemini = (text: string) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text }] } }] }),
    });
  const valid = { cameraId: 'cam_03', location: 'executive_floor' };

  it.each([undefined, 'yes', 1])('returns 400 for ariaNameKnown = %j', async flag => {
    const res = await callHandler({ body: { ...valid, ariaNameKnown: flag } });
    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('ariaNameKnown');
  });

  it('scrubs a leaking feed while the name is unknown, keeps it once known', async () => {
    vi.stubGlobal('fetch', okGemini('A terminal reads ARIA.'));
    const hidden = await callHandler({ body: { ...valid, ariaNameKnown: false } });
    expect((hidden._json as { description: string }).description).toBe('A terminal reads CASSANDRA.');

    vi.stubGlobal('fetch', okGemini('A terminal reads ARIA.'));
    const known = await callHandler({ body: { ...valid, ariaNameKnown: true } });
    expect((known._json as { description: string }).description).toBe('A terminal reads ARIA.');
  });
});
```

(If a test file does not already set `GEMINI_API_KEY` in its own `beforeEach` for success cases, the `beforeEach` above covers the new describes. Check each file's existing success-test mock and reuse its response shape if it differs from `okGemini`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run api/__tests__/world.test.ts api/__tests__/file.test.ts api/__tests__/node-description.test.ts api/__tests__/camera.test.ts`
Expected: FAIL (flag not validated; no scrubbing; prompt wording unchanged).

- [ ] **Step 3: Implement**

`api/world.ts`:
- imports: `requireBoolean` from `./_lib/validate.js`; `{ scrubAriaName, withNameRule } from './_lib/ariaName.js'`.
- declare `let ariaNameKnown: boolean;` next to `let command: string;`; inside the validation `try`, after `command = requireString(…)`: `ariaNameKnown = requireBoolean(body['ariaNameKnown'], 'ariaNameKnown');`
- in the prompt assembly use `withNameRule(SYSTEM_PROMPT, ariaNameKnown)` instead of `SYSTEM_PROMPT`.
- in the final `response` object: `narrative: scrubAriaName(<existing expression>, ariaNameKnown)` and `suggestions: <existing expression>.map(s => scrubAriaName(s, ariaNameKnown))`.

`api/file.ts`:
- same imports; declare `let ariaNameKnown: boolean;`; inside the validation `try` after `fileName = …`: `ariaNameKnown = requireBoolean(body['ariaNameKnown'], 'ariaNameKnown');`
- `ariaInstruction`: replace the literal `an AI called Aria` with `${planter}` where `const planter = ariaNameKnown ? 'an AI called Aria' : 'an unknown entity (cover name CASSANDRA)';` (convert the string concatenation to include `planter`).
- `prompt`: wrap with `withNameRule(promptBase, ariaNameKnown)` (rename the existing `prompt` to `promptBase`), send the wrapped string to Gemini.
- return `content: scrubAriaName(text, ariaNameKnown)` for the success response (not the fallback).

`api/node-description.ts`: same pattern — flag after the existing four fields; `an AI called Aria` → `planter` as above; wrap the prompt; `description: scrubAriaName(text, ariaNameKnown)`.

`api/camera-feed.ts`: flag after `location`; wrap the prompt with `withNameRule`; `description: scrubAriaName(text, ariaNameKnown)`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run api && pnpm tsc -b`
Expected: PASS (all existing handler tests still pass through the default-flag helper).

- [ ] **Step 5: Commit**

```bash
git add api
git commit -m "feat: gate world, file, node-description and camera-feed prompts on the name flag (#213)"
```

---

### Task 3: sentinel and aria handlers

**Files:**
- Modify: `api/sentinel.ts`, `api/aria.ts`
- Test: `api/__tests__/sentinel.test.ts`, `api/__tests__/aria.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- `sentinel`: flag required (after `message`); `systemPrompt` becomes `withNameRule(systemPrompt, ariaNameKnown)`; returned `reply` is scrubbed.
- `aria`: flag required (after `message`); the system prompt becomes `withAriaIntro(SYSTEM_PROMPT, ariaNameKnown)` on **both** model backends (Gemini and the Claude path); her reply is **not** scrubbed.

- [ ] **Step 1: Update helpers and write the failing tests**

Add the same `withFlag` helper and `JSON.stringify(withFlag(body))` change to `callHandler` in `sentinel.test.ts` and `aria.test.ts` (as in Task 2).

Append to `api/__tests__/sentinel.test.ts`:

```ts
describe('POST /api/sentinel — name rule', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  it.each([undefined, 'yes', 1])('returns 400 for ariaNameKnown = %j', async flag => {
    const res = await callHandler({
      body: {
        message: 'hello',
        sentinelContext: { traceLevel: 1, currentNodeId: 'n', currentLayer: 0, recentCommands: [] },
        ariaNameKnown: flag,
      },
    });
    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('ariaNameKnown');
  });

  const send = (known: boolean) =>
    callHandler({
      body: {
        message: 'hello',
        sentinelContext: { traceLevel: 10, currentNodeId: 'n', currentLayer: 0, recentCommands: [] },
        ariaNameKnown: known,
      },
    });

  it('scrubs a leaking reply and adds the rule to the system prompt while the name is unknown', async () => {
    const fetchMock = mockGeminiOk(JSON.stringify({ reply: 'ARIA does not answer to you.' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await send(false);
    expect((res._json as { reply: string }).reply).toBe('CASSANDRA does not answer to you.');
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain('Never write the name');
  });

  it('applies the rule to the high-threat prompt as well', async () => {
    const fetchMock = mockGeminiOk(JSON.stringify({ reply: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    await callHandler({
      body: {
        message: 'hello',
        sentinelContext: { traceLevel: 70, currentNodeId: 'n', currentLayer: 3, recentCommands: [] },
        ariaNameKnown: false,
      },
    });
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain('Never write the name');
  });

  it('leaves the reply and the prompt untouched once the name is known', async () => {
    const fetchMock = mockGeminiOk(JSON.stringify({ reply: 'ARIA does not answer to you.' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await send(true);
    expect((res._json as { reply: string }).reply).toBe('ARIA does not answer to you.');
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('Never write the name');
  });
});
```

Append to `api/__tests__/aria.test.ts`:

```ts
describe('POST /api/aria — name rule', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
  });

  it.each([undefined, 'yes', 1])('returns 400 for ariaNameKnown = %j', async flag => {
    const res = await callHandler({ body: { message: 'Who are you?', ariaNameKnown: flag } });
    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('ariaNameKnown');
  });

  it('asks her to introduce herself while the name is unknown, and does not scrub her reply', async () => {
    const fetchMock = mockGeminiJson('I am Aria. Be careful.', 1);
    vi.stubGlobal('fetch', fetchMock);
    const res = await callHandler({ body: { message: 'Who are you?', ariaNameKnown: false } });
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain('introduce yourself by name');
    expect((res._json as { reply: string }).reply).toBe('I am Aria. Be careful.');
  });

  it('does not add the introduction rule once the name is known', async () => {
    const fetchMock = mockGeminiJson('Hello again.', 0);
    vi.stubGlobal('fetch', fetchMock);
    await callHandler({ body: { message: 'Who are you?', ariaNameKnown: true } });
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('introduce yourself by name');
  });
});
```

(If `aria.test.ts` also has a Claude-backend describe that sets `ANTHROPIC_API_KEY`/`ARIA_AI_*`, add one assertion there that the introduction rule appears in the Claude request body when the flag is `false`; reuse that describe's existing fetch mock shape.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run api/__tests__/sentinel.test.ts api/__tests__/aria.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`api/sentinel.ts`: imports as in Task 2; declare `let ariaNameKnown: boolean;` beside `let message: string;`; inside the validation `try` after `message = …`: `ariaNameKnown = requireBoolean(body['ariaNameKnown'], 'ariaNameKnown');`; `const systemPrompt = withNameRule(traceLevel >= 61 ? SYSTEM_PROMPT_HIGH_THREAT : SYSTEM_PROMPT_STANDARD, ariaNameKnown);`; response `reply: scrubAriaName(<existing expression>, ariaNameKnown)`.

`api/aria.ts`: import `requireBoolean` and `withAriaIntro` (not the scrubber); declare/validate the flag after `message`; define `const systemPrompt = withAriaIntro(SYSTEM_PROMPT, ariaNameKnown);` after the validation and use `systemPrompt` wherever `SYSTEM_PROMPT` is used in the request (both backends: the Gemini `fullPrompt` array and the Claude request's system field). Do not scrub the reply.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run api && pnpm tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api
git commit -m "feat: gate sentinel and aria prompts on the name flag (#213)"
```

---

### Task 4: Client — send the flag, protect it, mark Aria's introduction

**Files:**
- Modify: `src/engine/commands.ts`, `src/engine/sentinelChannel.ts`
- Test: `src/engine/commands.test.ts`, `src/engine/sentinelChannel.test.ts` (and `src/engine/__tests__/` where the Aria dialogue / favor tests live — find them with `grep -rln "api/aria" src`)

**Interfaces:**
- Consumes: `isAriaNameKnown`, `markAriaNameKnown`, `ARIA_NAME_FLAG` (`src/engine/ariaName.ts`).
- Behaviour:
  - Every request to `/api/world` (both call sites), `/api/aria` (both), `/api/node-description`, `/api/file`, `/api/camera-feed` and `/api/sentinel` includes `ariaNameKnown: isAriaNameKnown(state)`.
  - `flagsSet` from the world AI is applied with the protected key removed.
  - After a successful Aria reply, if the name was unknown and `/\baria\b/i` matches the reply, the resulting state is passed through `markAriaNameKnown`.
  - Engine-generated Aria dialogue lines use `ARIA` only when the name is known (otherwise `CASSANDRA`): the `// ARIA OFFER:` line, `// ARIA: Agreement logged.`, `// ARIA: Understood. The offer is withdrawn.`

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/sentinelChannel.test.ts` (inside the existing request describes, reusing `stubFetch`/`sentBody`):

```ts
  it('sends the name flag so the handler can apply the name rule', async () => {
    const fetchMock = stubFetch(vi.fn().mockResolvedValue(okResponse({ reply: 'x' })));
    const known = produce(createInitialState(), s => {
      s.flags['ARIA_NAME_KNOWN'] = true;
    });
    await requestSentinelReply(createInitialState(), 'hi');
    expect(sentBody(fetchMock).ariaNameKnown).toBe(false);

    const knownMock = stubFetch(vi.fn().mockResolvedValue(okResponse({ reply: 'x' })));
    await requestSentinelReply(known, 'hi');
    expect(sentBody(knownMock).ariaNameKnown).toBe(true);
  });
```

and the same assertion for `requestSentinelOpening` (copy the test with a `ChannelTrigger` fixture from the existing opening tests).

Append to `src/engine/commands.test.ts`:

```ts
describe('AI requests carry the name flag (#213)', () => {
  const lastBody = (fetchMock: ReturnType<typeof vi.fn>, urlPart: string) => {
    const call = fetchMock.mock.calls.find(c => String(c[0]).includes(urlPart));
    return JSON.parse((call?.[1] as { body: string }).body) as Record<string, unknown>;
  };

  it('the world AI request says the name is unknown, then known', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkFetchResponse(DEFAULT_AI_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);
    await resolveCommand('look around', createInitialState());
    expect(lastBody(fetchMock, '/api/world').ariaNameKnown).toBe(false);

    const known = produce(createInitialState(), s => {
      s.flags['ARIA_NAME_KNOWN'] = true;
    });
    const knownMock = vi.fn().mockResolvedValue(makeOkFetchResponse(DEFAULT_AI_RESPONSE));
    vi.stubGlobal('fetch', knownMock);
    await resolveCommand('look around', known);
    expect(lastBody(knownMock, '/api/world').ariaNameKnown).toBe(true);
  });

  it('the file generation request carries the flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkFetchResponse({ content: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    const state = produce(createInitialState(), s => {
      const node = s.network.nodes['contractor_portal']!;
      node.accessLevel = 'user';
      node.files = [
        {
          name: 'pending.txt',
          path: '/pending.txt',
          type: 'document',
          content: null,
          exfiltrable: true,
          accessRequired: 'user',
        },
      ];
    });
    await resolveCommand('cat /pending.txt', state);
    expect(lastBody(fetchMock, '/api/file').ariaNameKnown).toBe(false);
  });

  it('the world AI cannot set the protected ARIA_NAME_KNOWN flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, flagsSet: { ARIA_NAME_KNOWN: true, OTHER: true } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await resolveCommand('look around', createInitialState());
    const next = result.nextState as GameState;
    expect(next.flags['ARIA_NAME_KNOWN']).toBeUndefined();
    expect(next.flags['OTHER']).toBe(true);
  });
});

describe('Aria introducing herself (#213)', () => {
  const ariaReply = (reply: string, extra: Record<string, unknown> = {}) =>
    vi.fn().mockResolvedValue(makeOkFetchResponse({ reply, trustDelta: 0, ...extra }));

  it('sends the flag and marks the name known when her reply contains it', async () => {
    const fetchMock = ariaReply('I am Aria.');
    vi.stubGlobal('fetch', fetchMock);
    const result = await resolveCommand('msg aria hello', createInitialState());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as Record<string, unknown>;
    expect(body.ariaNameKnown).toBe(false);
    expect(isAriaNameKnown(result.nextState as GameState)).toBe(true);
  });

  it('does not mark the name known when her reply does not contain it', async () => {
    vi.stubGlobal('fetch', ariaReply('Careful. You are being watched.'));
    const result = await resolveCommand('msg aria hello', createInitialState());
    expect(isAriaNameKnown(result.nextState as GameState)).toBe(false);
  });

  it('does not mark the name known on an offline fallback reply', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await resolveCommand('msg aria hello', createInitialState());
    expect(isAriaNameKnown((result.nextState ?? createInitialState()) as GameState)).toBe(false);
  });

  it('does not say her name in the engine offer line while the name is unknown', async () => {
    vi.stubGlobal(
      'fetch',
      ariaReply('Careful.', { offersFavor: { description: 'I can open a door', cost: 3 } }),
    );
    const result = await resolveCommand('msg aria hello', createInitialState());
    const text = result.lines.map(l => l.content).join('\n');
    expect(text).toContain('CASSANDRA OFFER');
    expect(text).not.toMatch(/aria/i);
  });

  it('uses her name in the engine offer line once it is known', async () => {
    vi.stubGlobal(
      'fetch',
      ariaReply('Careful.', { offersFavor: { description: 'I can open a door', cost: 3 } }),
    );
    const known = produce(createInitialState(), s => {
      s.flags['ARIA_NAME_KNOWN'] = true;
    });
    const result = await resolveCommand('msg aria hello', known);
    expect(result.lines.map(l => l.content).join('\n')).toContain('ARIA OFFER');
  });
});
```

(`makeOkFetchResponse` and `DEFAULT_AI_RESPONSE` already exist at the top of `commands.test.ts`. If an earlier test file for the favor flow (accept/decline) exists, add: accepting/declining a favor before the name is known prints `// CASSANDRA: …` lines, and after, `// ARIA: …`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/engine`
Expected: FAIL (requests lack the flag; AI can set the protected flag; offer line says ARIA; introduction does not mark).

- [ ] **Step 3: Implement**

`src/engine/sentinelChannel.ts`: in `requestSentinelReply` and `requestSentinelOpening`, add `ariaNameKnown: isAriaNameKnown(state)` to the request body (import `isAriaNameKnown` from `./ariaName`).

`src/engine/commands.ts` (imports: `isAriaNameKnown`, `markAriaNameKnown`, `ARIA_NAME_FLAG` from `./ariaName`):
- Add `ariaNameKnown: isAriaNameKnown(state)` to: the world payload object (~line 560, `payload`), the second world call used by `exploit` (~line 1503, its payload), the Aria payload (~line 640, `payload`), the ending Aria payload (~line 786), the `/api/node-description` body, the `/api/file` body, and the `/api/camera-feed` body.
- Both `Object.assign(s.flags, aiResponse.flagsSet)` sites: apply a sanitized copy, `Object.assign(s.flags, withoutProtectedFlags(aiResponse.flagsSet))`, with a small module-level helper:

```ts
// The AI may suggest game flags, but the secret-name flag is set only by the engine.
const withoutProtectedFlags = (flags: Record<string, boolean>): Record<string, boolean> =>
  Object.fromEntries(Object.entries(flags).filter(([key]) => key !== ARIA_NAME_FLAG));
```

- In `cmdAriaAI`, after `const next = produce(state, …)` and before building lines:

```ts
  // If she introduced herself, the player now knows her name. Skip the offline fallback.
  const introduced =
    !isAriaNameKnown(state) && aiResponse !== ARIA_AI_FALLBACK && /\baria\b/i.test(safeReply);
  const finalState = introduced ? markAriaNameKnown(next) : next;
  const tag = isAriaNameKnown(finalState) ? 'ARIA' : 'CASSANDRA';
```

  use `tag` in ``line(`// ${tag} OFFER: …`)``, and return `withTurn({ lines, nextState: finalState }, raw, state)`.
- `cmdAcceptFavor` and `cmdDeclineFavor`: derive `const tag = isAriaNameKnown(state) ? 'ARIA' : 'CASSANDRA';` and use ``// ${tag}: Agreement logged.`` / ``// ${tag}: Understood. The offer is withdrawn.``.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src && pnpm tsc -b`
Expected: PASS (existing tests that assert the old `// ARIA OFFER` text keep passing only if their state has the flag set; update those that run with a fresh state to expect `CASSANDRA`, or set the flag in their fixture, whichever keeps the test's intent).

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: send the name flag to every AI call and mark Aria's introduction (#213)"
```

---

### Task 5: Docs, full checks, verification

**Files:** `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Extend the "Naming rule" paragraph: every AI handler requires `ariaNameKnown` (boolean) in its request; while it is `false` the prompt forbids the name, the returned text is scrubbed (`api/_lib/ariaName.ts`), and `flagsSet` from the world AI can never set the protected flag. Aria's own handler is the one exception: she introduces herself, and her reply sets the flag when it contains her name.

- [ ] **Step 2: Run the full checks**

Run, in order: `pnpm format`, `pnpm tsc -b`, `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip`
Expected: all pass.

- [ ] **Step 3: Verify in the browser (request payloads)**

Start a throwaway dev server (`pnpm exec vite --port 5199 --strictPort`) and drive it with Playwright, routing `**/api/**` to canned JSON and recording each request body. Log in, then: run an unknown command (`look around`) and check the `/api/world` body has `ariaNameKnown: false`; `cat` a file with `content: null` (a filler-node file or via a save patch) and check `/api/file`; run `msg aria hello` with `/api/aria` returning `{ reply: 'I am Aria.', trustDelta: 0 }` and confirm the body had `ariaNameKnown: false`, then that `help` lists `msg aria` (the introduction set the flag) and the next `/api/aria` body has `ariaNameKnown: true`; run `msg aria hello` on a fresh run with a reply that does not contain the name and confirm help still hides `msg aria`; have `/api/world` return `flagsSet: { ARIA_NAME_KNOWN: true }` and confirm the flag is still unset afterwards (`help` hides `msg aria`). For Sentinel, patch a save onto a layer-3 node at trace 81 and confirm the `/api/sentinel` bodies carry the flag. Kill the dev server by its port listener afterwards.

- [ ] **Step 4: Commit**

```bash
git add -A src api CLAUDE.md
git commit -m "docs: document the AI name gating (#213)"
```
