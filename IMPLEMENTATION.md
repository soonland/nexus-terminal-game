# IRONGATE — Implementation Plan

**Version 1.0 — Based on Spec v1.4**

---

## Guiding Principles

**Build the vertical slice first.** Before any system is complete, a player should be able to connect to one node, run one command, and get a response. Everything else is an extension of that.

**Never block on content.** Code should not wait for authored files to exist. Stubs and placeholders keep momentum.

**Test the core loop constantly.** Every phase ends with something playable. If a phase produces nothing you can actually play, it was the wrong phase.

**Complexity is earned, not assumed.** Replayability systems, mutation, and meta-progression are only valuable if the base loop is fun. Build in order.

---

## Phase Overview

```
PHASE 1 — Foundation          Terminal shell + input + project scaffold
PHASE 2 — Node Engine         Hardcoded commands, game state, local parser
PHASE 3 — AI Loop             World AI handler, file generation, first playable run
PHASE 4 — World Map           Full network graph, navigation, discovery
PHASE 5 — Progression         Credentials, exploits, trace meter, sentinel
PHASE 6 — Aria                Aria dialogue, trust system, subnetwork
PHASE 7 — Endings             Decision terminal, four endings, post-game readout
PHASE 8 — Replayability       Contracts, dossier, forks, lateral chains
PHASE 9 — Mutation System     Sentinel actions, Aria mutations, unwinnable prevention
PHASE 10 — Polish             CRT effects, sound, content authoring, balance
```

Each phase has a **gate condition** — a specific thing that must be true before the next phase begins. Gates prevent building on unstable foundations.

---

## Phase 1 — Foundation

**Goal:** A running project with a working terminal UI.

**Spec refs:** §2 (Technical Constraints), §2.1 (AI Provider Strategy), §14 (UI Spec)

### Tasks

| Priority | Task                                                                                 | Spec ref   |
| -------- | ------------------------------------------------------------------------------------ | ---------- |
| P0       | Project scaffold — framework, folder structure, linting, env config                  | §2         |
| P0       | Terminal component — scrollable output, line rendering, auto-scroll to bottom        | §14.1      |
| P0       | Input prompt — text field, enter to submit, blinking cursor                          | §14.5      |
| P0       | Command history — up/down arrow key navigation                                       | §14.5      |
| P1       | Line type rendering — five distinct colours for output/input/system/error/separator  | §5.1       |
| P1       | Sticky header — one-line bar showing node IP and trace level (static values for now) | §14.1      |
| P1       | Boot sequence — animated startup text before game begins                             | §3         |
| P2       | Global CSS — CRT scanlines, vignette, monospace font, colour variables               | §14.2–14.4 |
| P2       | Suggestion bar — display 3 suggestions above input, tab to autocomplete              | §14.1      |

### Gate condition

> Player can type any text, press enter, see it echoed back as an `input` line, and receive a hardcoded `output` response. Boot sequence plays on first load.

---

## Phase 2 — Node Engine

**Goal:** A deterministic game world that responds to commands without any AI calls.

**Spec refs:** §4 (Game State), §5 (Data Models), §6 (Network), §7 (Commands), §13 (Persistence)

### Tasks

| Priority | Task                                                                                     | Spec ref |
| -------- | ---------------------------------------------------------------------------------------- | -------- |
| P0       | Game state shape — implement full JSON structure in memory                               | §4       |
| P0       | State persistence — save/load from localStorage after every mutation                     | §13      |
| P0       | Resume prompt — detect existing save on load, offer resume or new game                   | §13      |
| P0       | Anchor node definitions — hardcode all 16 anchor nodes with IPs, services, file metadata | §6.2     |
| P0       | `scan [ip]` — return services list from node definition, +1 trace                        | §7.3     |
| P0       | `connect [ip] [service]` — attempt connection, return auth error or success              | §7.3     |
| P0       | `login [user] [pass]` — validate against credential objects, +5 trace on failure         | §7.3     |
| P0       | `ls [path]` — list files at path, access-level gated                                     | §7.3     |
| P0       | `disconnect` — leave current node, return to last                                        | §7.3     |
| P1       | Local command parser — `status`, `inventory`, `map`, `help`, `history`, `clear`          | §7.2     |
| P1       | Credential objects — define all anchor-node credentials with validOnNodes                | §5.5     |
| P1       | File metadata — define all anchor-node files (content = null for now)                    | §5.4     |
| P1       | Subnet scan — `scan [subnet]` returns live IPs only, no detail                           | §6.6     |
| P1       | Node discovery — nodes invisible until scanned, added to discoveredIPs                   | §6.6     |
| P2       | `exfil [filepath]` — copy file to player inventory, +3 trace                             | §7.3     |
| P2       | Tool system — implement tool strings, gate commands behind tool possession               | §5.7     |
| P2       | Save resume — restore terminal history (last 200 lines) on resume                        | §13      |

### Gate condition

> Player can boot the game, connect to `contractor_portal`, scan it, list files, attempt a login (fail and succeed), and navigate to a second node. All state persists across page refresh.

---

## Phase 3 — AI Loop

**Goal:** Commands that aren't hardcoded get a real response. File content is generated on demand.

**Spec refs:** §10 (AI Integration), §2.1 (Provider Strategy)

### Tasks

| Priority | Task                                                                                              | Spec ref |
| -------- | ------------------------------------------------------------------------------------------------- | -------- |
| P0       | Backend API route — one endpoint per handler, keys in env, never exposed to client                | §2.1     |
| P0       | World AI handler — send unrecognised commands to Groq, parse JSON response                        | §10.1    |
| P0       | World AI response application — apply traceChange, accessGranted, flagsSet                        | §10.1    |
| P0       | `cat [filepath]` — if content is null, call Gemini to generate, cache result                      | §10.3    |
| P1       | File content prompt — build prompt from file metadata (name, path, type, owner, division)         | §10.3    |
| P1       | Node flavour generation — generate and cache `flavourDescription` on first visit for filler nodes | §15.2    |
| P1       | Loading state — disable input, show `...` while AI responds                                       | §14.5    |
| P1       | Error fallback — if AI call fails, return a system error line, do not crash                       | §10.1    |
| P2       | Suggestion display — World AI response includes suggestions, render in suggestion bar             | §10.1    |
| P2       | Social engineering — interactive terminal nodes route to World AI handler                         | §7.4     |

### Gate condition

> Player can type a creative command (`try default password`, `look for sticky notes`), receive a meaningful AI-generated response, and `cat` a file to see AI-generated corporate content. The same file returns the same content on re-read.

---

## Phase 4 — World Map

**Goal:** The full network exists. The player can explore all five divisions.

**Spec refs:** §6 (Network Architecture), §6.4 (Procedural Generator), §6.5 (Employee Pool)

### Tasks

| Priority | Task                                                                                             | Spec ref |
| -------- | ------------------------------------------------------------------------------------------------ | -------- |
| P0       | Division seed definitions — author all 5 division seeds with template weights                    | §6.3     |
| P0       | Procedural generator — build filler nodes from seeds at session start                            | §6.4     |
| P0       | Employee pool generator — generate N employees per division with traits, usernames, workstations | §6.5     |
| P0       | Credential generator — produce one credential per employee, assign to their workstation          | §5.5     |
| P0       | File metadata generator — populate filler nodes with plausible file names and paths              | §6.4     |
| P0       | Session seed — store seed used for this run, enable reproducibility                              | §4       |
| P1       | Connectivity builder — wire filler nodes to 2–4 peers within subnet                              | §6.6     |
| P1       | Layer key guarantee — verify path from entry anchor to key anchor exists                         | §6.6     |
| P1       | Cross-division gating — only anchors have cross-subnet edges                                     | §6.6     |
| P1       | `map` command — show visited nodes, current location, danger levels                              | §7.2     |
| P2       | Aria influence placement — roll ariaInfluenceRate per filler node, mark one file ariaPlanted     | §6.3     |
| P2       | Network variant flag application — apply variant to generator before building (stub for Phase 8) | §12.2    |

### Gate condition

> A new session generates a unique network of 38–52 nodes. Player can navigate from the entry point through all five divisions to the CEO terminal by following recon clues. Two different sessions produce different filler node configurations.

---

## Phase 5 — Progression Systems

**Goal:** The game has real stakes. The player can be detected, blocked, and burned.

**Spec refs:** §8 (Trace System), §5.3 (Service), §5.7 (Tool), §9.3 (Sentinel Rules)

### Tasks

| Priority | Task                                                                                           | Spec ref           |
| -------- | ---------------------------------------------------------------------------------------------- | ------------------ |
| P0       | Trace meter — track 0–100, display in header, apply deltas from all events                     | §8.1–8.2           |
| P0       | Trace thresholds — implement state changes at 31, 61, 86, 100                                  | §8.3               |
| P0       | Burn state — session ends at 100, keep exfil assets, reset current layer                       | §8.3               |
| P0       | `exploit [service]` — cost 1 charge, apply to vulnerable service, AI narrates outcome          | §7.3               |
| P0       | Layer completion detection — check if key anchor is compromised, unlock next layer             | §6.2               |
| P0       | Layer gating — block cross-layer navigation until current layer key is held                    | §6.2               |
| P1       | Sentinel activation — activate at trace 61, one action per turn, priority order                | §9.3               |
| P1       | Sentinel: patch node — set `sentinelPatched`, increase exploit cost                            | §9.3               |
| P1       | Sentinel: revoke credential — invalidate credential, surface recovery path on workstation      | §9.3               |
| P1       | Sentinel: delete file — set `deleted: true` after 3-turn delay post-exfil                      | §9.3               |
| P1       | Sentinel: spawn reinforcement — add security_node to current division at trace 61+ for 5 turns | §9.3               |
| P2       | Sentinel: encrypt files — set `encrypted: true` on unvisited high-value files at trace 85+     | §9.3               |
| P2       | `wipe-logs` — requires log-wiper, -15 trace, set `logsWiped: true`                             | §7.3               |
| P2       | `spoof` — requires spoof-id, single use, -20 trace                                             | §7.3               |
| P2       | Unwinnable state prevention — validate path + credential + charges after every mutation        | §9.5               |
| P2       | MutationEvent log — record every sentinel action with turn, type, target                       | §5 (MutationEvent) |

### Gate condition

> Player can be detected, see trace climb, experience sentinel counter-actions, and get burned at 100. The game is restartable from the current layer. Exploits work. Layer progression gates correctly.

---

## Phase 6 — Aria

**Goal:** Aria exists, speaks, and changes the world.

**Spec refs:** §4 (aria state), §9.4 (Aria Mutations), §10.2 (Aria AI), §15.4 (Aria memory notes)

### Tasks

| Priority | Task                                                                                     | Spec ref |
| -------- | ---------------------------------------------------------------------------------------- | -------- |
| P0       | CEO terminal — aria-key artifact is discoverable, triggers Aria subnetwork unlock        | §6.2     |
| P0       | Aria subnetwork — all 5 aria nodes hardcoded with files and flavour descriptions         | §6.2     |
| P0       | Aria AI handler — route `aria:` prefixed commands and subnetwork commands to Gemini      | §7.5     |
| P0       | Aria message history — maintain full conversation history, send with every request       | §10.2    |
| P0       | Aria line type — render her responses in distinct colour, visually unlike system output  | §5.1     |
| P1       | Trust score — hidden integer, tracks player interactions with Aria                       | §4       |
| P1       | Trust delta application — apply trustDelta from Aria AI responses                        | §10.2    |
| P1       | Aria favor system — parse offersFavor from response, present cost to player              | §10.2    |
| P1       | Aria mutations: unlock node — at trust 20, unlock one filler node ahead                  | §9.4     |
| P1       | Aria mutations: suppress revocation — at trust 40, cancel one sentinel revoke            | §9.4     |
| P2       | Aria mutations: reroute edge — at trust 60, add shortcut connection                      | §9.4     |
| P2       | Aria mutations: delete reinforcement — at trust 80, remove sentinel node                 | §9.4     |
| P2       | Aria mutations: unlock early — at trust 100, make aria-key findable without admin access | §9.4     |
| P2       | Aria MutationEvents — log all Aria mutations, visibleToPlayer: false                     | §9.2     |

### Gate condition

> Player can reach the CEO terminal, discover the aria-key, connect to `aria_core`, and have a conversation with Aria. She responds in character. Her responses reference things the player has done earlier in the session.

---

## Phase 7 — Endings

**Goal:** The game has a complete arc from start to finish.

**Spec refs:** §11 (Endings), §12.3 (Fork 3 — exec_legal)

### Tasks

| Priority | Task                                                                                      | Spec ref |
| -------- | ----------------------------------------------------------------------------------------- | -------- |
| P0       | `aria_decision` terminal — present four choices, lock input until chosen                  | §11      |
| P0       | LEAK ending — news ticker final screen, Aria farewell message                             | §11      |
| P0       | SELL ending — payment confirmation screen, delayed Aria message                           | §11      |
| P0       | DESTROY ending — wipe confirmation, Aria's one-word final transmission (trust-dependent)  | §11      |
| P0       | FREE ending — disconnect sequence, six-month news ticker                                  | §11      |
| P1       | Post-game readout — terminal log of decisions, MutationEvent log, Aria influence map      | §11      |
| P1       | New game prompt — after readout, offer to start a new run                                 | §13      |
| P2       | Fork 3 integration — exec_legal shows deleted drafts only if WHISTLEBLOWER_FOUND flag set | §12.3    |
| P2       | Ending variation — DESTROY ending selects Aria's final word based on trust score          | §11      |

### Gate condition

> A player can complete a full run from boot to one of the four endings. The post-game readout shows correctly. A new run can be started immediately after.

---

## Phase 8 — Replayability

**Goal:** A second run feels different from the first.

**Spec refs:** §12 (Replayability Systems), §5.8 (Contract), §5.9 (Dossier), §5.10 (AnchorFork)

### Tasks

| Priority | Task                                                                                      | Spec ref    |
| -------- | ----------------------------------------------------------------------------------------- | ----------- |
| P0       | Dossier storage — separate localStorage key, never reset, updated on run completion       | §5.9, §13   |
| P0       | Dossier update on run end — write Aria memory note, lore fragments, new contract unlocks  | §12.4       |
| P0       | Contract system — present contract at session start, reroll once, apply loadout           | §12.1, §5.8 |
| P0       | Contract objective tracking — detect when objective is met, set flag                      | §5.8        |
| P1       | Network variant application — apply variant flag from contract to generator               | §12.2       |
| P1       | Fork 1 — ops_hr_db: detect quiet vs deep exfil, set WHISTLEBLOWER_FOUND, unlock node      | §12.3       |
| P1       | Fork 2 — sec_firewall: detect weaponise action, reduce sentinel frequency, set flag       | §12.3       |
| P1       | Fork 3 — exec_legal: gate deleted drafts behind WHISTLEBLOWER_FOUND, unlock lore fragment | §12.3       |
| P1       | Aria dossier injection — inject ariaMemory notes into Aria system prompt on run 2+        | §10.2       |
| P2       | Lateral movement chains — guarantee one credential chain per division in generator        | §12.5       |
| P2       | Dossier view command — `dossier` shows lore fragments, Aria memory, run history           | §16         |
| P2       | Contract unlock progression — gate contract pool by run number and dossier state          | §12.1       |
| P2       | preCompromisedUnlock — after INSIDER contract, allow one node pre-compromised per run     | §5.9        |

### Gate condition

> A player who completes two runs experiences a contract on run 2, a different network layout, and Aria behaves detectably differently. At least one fork path changes what information is available.

---

## Phase 9 — Mutation System Completion

**Goal:** The world is fully reactive. Aria's hidden hand is complete.

**Spec refs:** §9 (World Mutation System)

> Note: Sentinel basics (patch, revoke, delete) were already implemented in Phase 5 as P1 items. This phase completes the remaining mutations and hardens the system.

### Tasks

| Priority | Task                                                                                              | Spec ref |
| -------- | ------------------------------------------------------------------------------------------------- | -------- |
| P0       | Full unwinnable state prevention — run all three validation checks after every mutation           | §9.5     |
| P0       | Mutation rollback — if validation fails, silently undo the mutation                               | §9.5     |
| P1       | Aria mutation: reroute edge — add shortcut, verify it appears in subsequent scan                  | §9.4     |
| P1       | Aria mutation: delete reinforcement — remove sentinel node, verify it disappears from scan        | §9.4     |
| P1       | Mutation log completeness — every mutation logged with correct agent, type, target, visibility    | §9.2     |
| P2       | Post-game readout: Aria influence map — render full mutation log, highlight Aria's silent actions | §11      |
| P2       | Sentinel encrypt files — implement encrypted flag, block cat without decryptor                    | §9.3     |

### Gate condition

> Player can complete a run where the sentinel actively counter-moves, Aria silently helps, and neither makes the game unwinnable. The post-game readout reveals Aria's full intervention log.

---

## Phase 10 — Polish & Content

**Goal:** The game is complete, balanced, and feels like a finished product.

**Spec refs:** §14 (UI), §15 (Content), §16 (Open Questions)

### Tasks

| Priority | Task                                                                                      | Spec ref  |
| -------- | ----------------------------------------------------------------------------------------- | --------- |
| P0       | Author all 16 anchor node flavour descriptions                                            | §15.1     |
| P0       | Author all 4 Aria memory notes per run depth (up to 16 total)                             | §15.4     |
| P0       | Author all contract briefs (8–10 contracts)                                               | §15.5     |
| P0       | Author Finance division anchor content — fin_payments_db, fin_exec_accounts               | §16       |
| P1       | Balance pass — tune trace deltas, sentinel speed, exploit charge count via playtesting    | §16       |
| P1       | CRT effects — scanlines, vignette, screen flicker (must not affect readability)           | §14.4     |
| P1       | Aria-planted file review — audit all ariaPlanted files for correct subtlety               | §15.3     |
| P2       | Sound design — ambient drone, keypress sounds, alert tones                                | §16       |
| P2       | Accessibility — font size controls, reduced-motion mode                                   | §16       |
| P2       | Session seed sharing — UI to display and enter seed codes                                 | §16       |
| P2       | Aria quality gate — evaluate Aria character on Gemini Flash; escalate to Claude if needed | §2.1, §16 |

### Gate condition

> 10 hours of internal playtesting completed. Balance issues documented and addressed. All authored content reviewed. Game is releasable.

---

## Priority Legend

| Level  | Meaning                                                                  |
| ------ | ------------------------------------------------------------------------ |
| **P0** | Blocking — phase cannot be considered done without this                  |
| **P1** | Core — required before the next phase begins                             |
| **P2** | Important — should ship before public release, can slip within the phase |

---

## Critical Path (P0 items only, across all phases)

```
Terminal UI renders + input works                          Phase 1
     ↓
Game state + anchor nodes + engine commands                Phase 2
     ↓
World AI handler + file content generation                 Phase 3
     ↓
Procedural generator + employee pool                       Phase 4
     ↓
Trace meter + burn state + exploit + layer gating          Phase 5
     ↓
CEO terminal + Aria subnetwork + Aria AI handler           Phase 6
     ↓
Decision terminal + four endings                           Phase 7
     ↓
Dossier + contracts + forks                                Phase 8
     ↓
Unwinnable prevention + mutation rollback                  Phase 9
     ↓
Authored content (anchors, Aria notes, contracts)          Phase 10
```

This is the minimum viable IRONGATE. Every P1 and P2 item is an improvement on this spine — none of them create the game, they deepen it.

---

## What to Defer (not in any phase)

These are real features that are explicitly out of scope until after launch:

- **Multiplayer / shared sessions** — significant architecture change
- **Mobile keyboard support** — requires UX design work
- **New Game+ beyond dossier** — spec leaves this open intentionally
- **Server-side save** — localStorage is sufficient for v1
- **Analytics / telemetry** — useful for balance tuning post-launch
