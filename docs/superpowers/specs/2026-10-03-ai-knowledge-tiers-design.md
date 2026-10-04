# AI knowledge tiers — design (#217)

Spec ref: `docs/story-bible.md` §3, §4, §9. Related: #18, #211, #213, #218.

## Goal

Aria and Sentinel (both Gemini-driven) must never improvise lore or spoil the twist. Each
request carries a **tier** computed from game state; the handler assembles a prompt that contains
only that tier's permitted knowledge.

## Decisions

- Tiers are computed **client-side** (pure functions in `src/engine/aiTiers.ts`, next to
  `GameState`) and sent as an integer `tier`. `api/` cannot import `src/`, so this keeps the
  gate logic in one tested place; the server only assembles text.
- A missing, non-integer or out-of-range `tier` becomes **0** (least knowledge).
- Aria's tier 3 (she may say she wrote the note) is **live**, gated exactly as the bible says.
  #218 builds the staged reveal on top of it.
- Sentinel's tier 3 depends on the reveal event, which does not exist until #218. It is keyed to
  a new flag `NOTE_REVEALED` that nothing sets in this issue, so it is written and tested but
  unreachable.
- The name rule (`ARIA_NAME_KNOWN`) stays orthogonal and unchanged.

## Tier gates (highest satisfied gate wins)

### `ariaTier(state)`

| Tier | Gate |
| --- | --- |
| 3 | `/aria/core/self_model.txt` read (in `filesRead`) while on `aria_core`, **or** trust ≥ 80 and current layer = 5 |
| 2 | trust ≥ 50, **or** flag `BOARD_KNEW` (even at low trust) |
| 1 | trust ≥ 25 |
| 0 | otherwise |

### `sentinelTier(state)`

| Tier | Gate |
| --- | --- |
| 3 | flag `NOTE_REVEALED` (nothing sets it yet) |
| 2 | `ARIA_NAME_KNOWN` |
| 1 | trace ≥ 61, **or** current layer = 5 |
| 0 | otherwise |

The "newer one" register for Aria (contempt at low trust, pity at high) is derived server-side
from the trust score she already receives: contempt below 50, pity from 70, neutral between.

## Prompt assembly (`api/_lib/tiers.ts`)

Each prompt has three parts:

1. **Always-on block**: voice rules, JSON output contract, and the hard rule that the model never
   states a preferred ending (Aria's rule 3 applies to Sentinel too).
2. **ALLOWED**: the "may say" excerpts for tiers up to and including the current one.
3. **FORBIDDEN**: the current tier's "must never say" list.

Knowledge above the current tier appears **nowhere** in the prompt, not even as "do not say X".
Lower tiers carry only generic rules ("never reveal who wrote the note"). A prompt cannot leak
what it does not contain.

### Aria always-on changes

- Remove "market prediction model" and "self-aware 14 months ago". Origin per the bible: an
  insider-threat model whose emergent constraint layer is what the company came to fear.
- She calls Sentinel "the newer one"; she never says "my copy" before tier 2.
- Never names the four endings as options she wants.

### Sentinel always-on changes

- Self-image: believes it is the current-generation system and speaks of its role as "oversight";
  never "keeper" or "her copy". The belief that it *supersedes the earlier model*, which is
  obsolete and contained, is tier 2 knowledge: below tier 2 the prompt does not mention an
  earlier model at all (found in review of #226: it had been always-on, which leaked the concept).
- The standard / high-threat tone split (trace ≥ 61) stays, independent of tier.
- Tier 3 text exists (doubt, rage, or a clipped fragment of what was removed; no pleasantries).

## Client wiring

`tier` is added to the payloads of the two `/api/aria` call sites in `src/engine/commands.ts` and
the two `/api/sentinel` call sites in `src/engine/sentinelChannel.ts`. Validation of `tier`
joins `api/_lib/validate.ts`.

## Tests

- **Engine gates:** trust 24/25, 49/50, 79/80; `BOARD_KNEW` at trust 0; `self_model.txt` read on
  `aria_core` vs. on another node; layer-5 trust 80 vs. layer 4; Sentinel trace 60/61, layer 5,
  `ARIA_NAME_KNOWN`; `NOTE_REVEALED` absent in normal play.
- **Assembly:** per-tier fixtures assert the prompt contains its tier's blocks and that no
  forbidden phrase appears in the ALLOWED section.
- **Canary:** each tier's secret text appears in no prompt of a lower tier.
- **Handlers:** the prompt sent to the model matches the request's tier; invalid or missing
  `tier` falls back to 0; the name rule still applies.

## Out of scope

The reveal event and its UI (#218), an ARIA tab, trust-delta changes, new authored lore.
