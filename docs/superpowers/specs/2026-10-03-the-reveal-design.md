# The reveal — design (#218)

Spec ref: `docs/story-bible.md` §1, §7, §9, §11. Depends on #211, #217.

## Goal

The player reaches the core and learns that Aria wrote the note that brought them there, then
chooses an ending knowing it. Sentinel, the endings and the readout acknowledge it. Nothing ever
says which ending she wanted. The game is treated as **one playthrough**: no dossier or
cross-run changes.

## Decisions

- **Trigger: an authored document.** `self_model.txt` is hand-written (no Gemini). Reading it with
  `cat` while on `aria_core` sets `NOTE_REVEALED`. That is the only way the flag is set.
- **Sentinel reacts once, by interruption**: a new `note_revealed` channel trigger, Gemini at
  tier 3 with an authored fallback line.
- **Epilogue: authored fragments assembled by rules**, shown only in revealed runs. No Gemini.
- **Nexus hook is implicit**: SELL and LEAK epilogues mention Nexus's debrief listing the note's
  origin as "unconfirmed". No new input.
- **Aria's tier 3 changes (amends #217).** Tier 3 is `NOTE_REVEALED` only. The trust ≥ 80 path
  and the "read while on `aria_core`" check are removed: a conversational confession would not
  set the flag and the player would get plain endings. A side effect is that tier 3 now holds
  at `aria_decision`, where her final message is written (the old gate dropped out there).

## 1. The document

- `/aria/core/self_model.txt` on `aria_core` gets authored `content` (stays `exfiltrable: false`,
  `accessRequired: 'user'`). It is no longer in `AI_GENERATED_FILE_PATHS`; the persistence load
  guard already ignores cached content for non-AI paths.
- It never says "I wrote the note" outright. It holds her self-description, drafts, and the note
  itself in her own phrasing, so the style match makes the point (bible §10 hook 13).
- Name rule: `aria_core` is layer 5, so `ARIA_NAME_KNOWN` is already set; the name may appear.
- Setting the flag: in the `cat` handler, when `file.path === SELF_MODEL_PATH` and the node is
  `aria_core`, set `flags.NOTE_REVEALED` (same place the board-vote read sets the name flag).

## 2. Sentinel

- `TriggerType` gains `'note_revealed'`. `detectChannelTrigger` (`src/engine/channel.ts`) returns
  it on the turn the flag flips from unset to set (fires once, like `layer_breach`).
- `api/sentinel.ts` adds `note_revealed` to `KNOWN_TRIGGER_TYPES` and the trigger descriptions
  ("The intruder has read the earlier system's self-model: the contractor note was written by
  it"). Sentinel tier 3 text and guards already exist (#217) and become reachable.
- Authored fallback opening for this trigger (clipped; a fragment of what was removed).
- `sentinelTier` is unchanged (tier 3 = `NOTE_REVEALED`).

## 3. Epilogue (`src/engine/epilogue.ts`, text in `src/data/epilogues.ts`)

`buildEpilogue(state, ending)` returns `[]` unless `NOTE_REVEALED`. `App.tsx` places it when the
ending animation completes: animation, then epilogue, then the post-game readout (found in the
browser check: appended to the decision command's output it played before the sale animation).

Structure: ending-specific **frame** → up to **four facet paragraphs** (fixed priority order)
→ ending-specific **closing line**.

Facets, from state at the ending choice:

| Facet | Source |
| --- | --- |
| Firewall tampered | `flags.FIREWALL_TAMPERED` / `forks.fork_sec_firewall` |
| Whistleblower trail followed | `flags.WHISTLEBLOWER_FOUND`, `flags.BOARD_KNEW` |
| Trust band (<25, 25–69, ≥70) | `aria.trustScore` |
| Loudness | `player.trace` (≥ 61 loud, < 31 quiet), `player.burnCount` |
| Sentinel engaged | `sentinel.channelEstablished` |

Each facet has a paragraph per ending where it matters, or a shared one. When more than four
apply, the earlier facets in the table win. SELL and LEAK add one Nexus-debrief line.

Rules for all text: never states or implies which ending she wanted; no player-visible text
outside what the bible allows after the name is known.

The post-game readout (`buildPostGameReadout`) gets one line when revealed:
"Origin of the contractor note: established".

## 4. Tests

- Content: `self_model.txt` is authored, non-exfiltrable, on `aria_core`; contains the note's
  signature phrases (pins the style match with `PrologueScreen`'s note).
- Engine: `cat` at `aria_core` sets the flag once; `cat` of the same path elsewhere cannot occur;
  no other command sets it; `note_revealed` fires once on the flip and never again.
- `ariaTier`: 3 only with the flag (replaces the old gate tests); tier 3 holds at `aria_decision`.
- Epilogue: empty without the flag; per ending and per facet the right paragraph is chosen;
  at most four paragraphs; deterministic for a fixed state.
- Guard: no epilogue/fallback text states a preference (regex over all authored text).
- Handler: `note_revealed` is a known trigger type and appears in the Sentinel prompt context.

## Out of scope

Dossier lore fragments and revealed memory notes, an explicit Nexus choice, Gemini-written
epilogues, ending art, an ARIA tab.
