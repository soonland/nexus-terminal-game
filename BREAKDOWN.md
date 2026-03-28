# IRONGATE — GitHub Issues
> Copy each issue block below into a new GitHub issue.
> Labels referenced: `phase-1` through `phase-10`, `p0`, `p1`, `p2`, `engine`, `ai`, `ui`, `content`, `replayability`, `mutation`, `polish`
> Create these labels in your repo before importing.

---
---

## PHASE 1 — Foundation

---

### [P1-01] Project scaffold

**Labels:** `phase-1` `p0` `engine`

**Spec ref:** §2 Technical Constraints, §2.1 AI Provider Strategy

#### Description
Set up the project from scratch. This is the foundation everything else builds on. No game logic yet — just a running app with correct structure, tooling, and environment configuration.

#### Tasks
- [ ] Initialise project with chosen framework (Next.js recommended per spec)
- [ ] Set up folder structure: `app/`, `components/Terminal/`, `engine/`, `types/`
- [ ] Configure TypeScript (strict mode)
- [ ] Configure linting (ESLint) and formatting (Prettier)
- [ ] Create `.env.example` with all three AI handler keys: `WORLD_AI_KEY`, `FILE_AI_KEY`, `ARIA_AI_KEY`
- [ ] Configure `WORLD_AI_BASE_URL`, `FILE_AI_BASE_URL`, `ARIA_AI_BASE_URL` as env vars
- [ ] Verify dev server runs with `npm run dev`
- [ ] Set up basic CI (lint + typecheck on push)

#### Acceptance criteria
> `npm run dev` starts without errors. `.env.example` documents all required keys. TypeScript and lint pass on an empty project.

---

### [P1-02] Terminal component — scrollable output

**Labels:** `phase-1` `p0` `ui`

**Spec ref:** §14.1 Layout

#### Description
The core UI component. A scrollable container that renders terminal output lines. No input yet — just the output pane.

#### Tasks
- [ ] Create `Terminal` component as full-viewport container
- [ ] Render an array of `TerminalLine` objects as output
- [ ] Auto-scroll to bottom whenever new lines are added
- [ ] Scrollable with mouse/trackpad; scrollbar styled to match terminal aesthetic
- [ ] Container must not clip or overflow horizontally

#### Acceptance criteria
> Hardcoded array of 50+ lines renders correctly. Adding a new line scrolls to bottom automatically. Horizontal text wraps cleanly.

---

### [P1-03] Input prompt with command history

**Labels:** `phase-1` `p0` `ui`

**Spec ref:** §14.5 Input Behaviour

#### Description
The input line at the bottom of the terminal. Handles text entry, submission, and command history navigation.

#### Tasks
- [ ] Text input field fixed to bottom of terminal
- [ ] Press Enter to submit command (must not be empty)
- [ ] Submitted command echoed as `input`-type line in output
- [ ] Blinking block cursor rendered after input field
- [ ] Up arrow navigates back through command history
- [ ] Down arrow navigates forward through command history
- [ ] History persists within session (in-memory only at this stage)
- [ ] Clicking anywhere on terminal refocuses input field

#### Acceptance criteria
> Player can type a command, submit with Enter, see it echoed. Up/down arrows cycle through previous commands correctly. Input stays focused after any click on the terminal.

---

### [P1-04] Line type rendering

**Labels:** `phase-1` `p1` `ui`

**Spec ref:** §5.1 TerminalLine

#### Description
Five line types must render with visually distinct colours. This is the primary information hierarchy of the UI.

#### Tasks
- [ ] `output` — main narrative (bright, primary colour)
- [ ] `input` — echoed player command (mid, prefixed with `> `)
- [ ] `system` — local engine responses (normal)
- [ ] `error` — failed commands, access denied (red / danger colour)
- [ ] `separator` — visual divider `──────` (dim, non-selectable)
- [ ] `aria` — Aria's messages (distinct from all others — cyan or white)
- [ ] All colours defined as CSS variables, not hardcoded hex values

#### Acceptance criteria
> All six line types render with clearly distinct colours. Aria lines are immediately visually distinguishable from system output.

---

### [P1-05] Sticky header bar

**Labels:** `phase-1` `p1` `ui`

**Spec ref:** §14.1 Layout

#### Description
One-line sticky header showing game state at a glance. Renders static placeholder values for now — it will connect to live state in Phase 2.

#### Tasks
- [ ] Fixed single-line bar at top of terminal
- [ ] Displays: game title | current node IP | TRACE: `n`%
- [ ] Does not scroll with terminal output
- [ ] Header and terminal output do not overlap

#### Acceptance criteria
> Header is always visible regardless of terminal scroll position. Placeholder values display correctly.

---

### [P1-06] Boot sequence animation

**Labels:** `phase-1` `p1` `ui`

**Spec ref:** §3 Core Gameplay Loop

#### Description
The first thing the player sees. A sequence of system-boot lines that play out before the game begins. Sets tone immediately.

#### Tasks
- [ ] On first load, display boot lines one by one with a short delay between each
- [ ] Lines include: version string, memory check, radiation level, "SURVIVOR PROFILE DETECTED", name prompt
- [ ] After last boot line, enter name-input phase
- [ ] Boot sequence plays only on new game, not on resume

#### Acceptance criteria
> Boot lines appear sequentially with visible timing. Final line prompts for player name. Resuming an existing save skips the boot sequence.

---

### [P1-07] Global CSS — CRT aesthetic base

**Labels:** `phase-1` `p2` `ui`

**Spec ref:** §14.2–14.4

#### Description
The visual foundation. Monospace font, terminal colour scheme, and optional CRT effects. Effects must not compromise readability.

#### Tasks
- [ ] Import monospace font (Fira Code or equivalent — no Inter, Arial, or system fonts)
- [ ] Define all colour CSS variables: bg, green, green-bright, green-mid, green-dim, danger, warn
- [ ] Background is near-black, not pure black
- [ ] CRT scanlines overlay (repeating gradient, ~4px pitch, very low opacity)
- [ ] Vignette overlay (radial gradient, darkens corners)
- [ ] Optional flicker animation on body (subtle, low frequency)
- [ ] All effects are CSS-only and do not affect interactivity

#### Acceptance criteria
> Terminal is visually distinctive and readable. CRT effects are visible but do not make text hard to read. Font renders as monospace on all major browsers.

---

### [P1-08] Suggestion bar

**Labels:** `phase-1` `p2` `ui`

**Spec ref:** §14.1 Layout

#### Description
Sits above the input line. Shows 2–3 suggested next commands. Tab autocompletes with the first suggestion.

#### Tasks
- [ ] Render suggestion buttons above input prompt
- [ ] Clicking a suggestion populates the input field (does not submit)
- [ ] Tab key autocompletes with first suggestion
- [ ] Suggestions are empty/hidden when no suggestions are set
- [ ] Suggestions accept a string array as props

#### Acceptance criteria
> Hardcoded suggestions render. Tab fills input with first suggestion. Clicking any suggestion populates input correctly. Empty array hides the bar entirely.

---
---

## PHASE 2 — Node Engine

---

### [P2-01] Game state implementation

**Labels:** `phase-2` `p0` `engine`

**Spec ref:** §4 Game State

#### Description
The single source of truth for all game data. Must match the spec exactly. All mutations go through this store.

#### Tasks
- [ ] Implement full state shape from §4: `session`, `contract`, `player`, `network`, `aria`, `forks`, `flags`, `terminalHistory`
- [ ] State is one serialisable JSON object
- [ ] All mutations are explicit functions — no direct state writes outside the store
- [ ] `phase` enum: `boot | naming | contract | playing | aria | ending | burned`
- [ ] `terminalHistory` capped at 200 lines

#### Acceptance criteria
> State can be serialised with `JSON.stringify` without data loss. Every field in §4 is present with correct types. State update functions are the only way to mutate state.

---

### [P2-02] localStorage persistence

**Labels:** `phase-2` `p0` `engine`

**Spec ref:** §13 Persistence

#### Description
Game state is saved automatically and restored on reload. Two separate keys: session save and dossier.

#### Tasks
- [ ] Auto-save to `irongate_save` after every state mutation
- [ ] On load: check for existing save, display resume prompt if found
- [ ] Resume prompt: show handle, layer, trace — offer `[R] Resume` or `[N] New game`
- [ ] Restore full state from save including terminal history (last 200 lines)
- [ ] `irongate_dossier` key reserved but not yet written (stub for Phase 8)
- [ ] New game clears `irongate_save` only, never `irongate_dossier`

#### Acceptance criteria
> Refreshing the page mid-game offers a resume prompt. Resuming restores the exact terminal state. Starting a new game clears the session save.

---

### [P2-03] Anchor node definitions

**Labels:** `phase-2` `p0` `engine`

**Spec ref:** §6.2 Anchor Nodes

#### Description
All 16 hardcrafted anchor nodes defined as static data. File content is `null` — that comes in Phase 3.

#### Tasks
- [ ] Define all 16 anchor nodes matching §6.2 table:
  - Layer 0: `contractor_portal`, `vpn_gateway`
  - Layer 1: `ops_cctv_ctrl`, `ops_hr_db`
  - Layer 2: `sec_access_ctrl`, `sec_firewall`
  - Layer 3: `fin_payments_db`, `fin_exec_accounts`
  - Layer 4: `exec_cfo`, `exec_legal`, `exec_ceo`
  - Aria: `aria_surveillance`, `aria_behavioural`, `aria_personnel`, `aria_core`, `aria_decision`
- [ ] Each node has: id, layer, divisionId, isAnchor: true, hostname, ip, os, services[], files[], connectedTo[]
- [ ] All file content fields set to `null`
- [ ] Service objects include: name, port, version, vulnerable, exploitCost, requiresCredential
- [ ] `flavourDescription` field present (stub string — authored content comes Phase 10)

#### Acceptance criteria
> All 16 nodes exist in the data layer. Each has at least 2 services and 2 files. The network path from `contractor_portal` to `exec_ceo` is navigable via `connectedTo` edges.

---

### [P2-04] Engine commands: scan, connect, login, ls, disconnect

**Labels:** `phase-2` `p0` `engine`

**Spec ref:** §7.3 Engine Commands

#### Description
The hardcoded command set. These never call AI. Every response is deterministic.

#### Tasks
- [ ] `scan [ip]` — requires `port-scanner` tool; returns services list; +1 trace; unknown IP returns error
- [ ] `scan [subnet]` — returns list of discovered IPs in subnet, no detail
- [ ] `connect [ip] [service]` — returns success if credential known or service is open; auth error otherwise
- [ ] `login [user] [pass]` — validates against credential store; +5 trace on failure; sets `accessLevel` on success
- [ ] `ls [path?]` — lists files at path on current node; gated by `accessLevel`; returns empty if no access
- [ ] `disconnect` — exits current node, sets `currentNodeId` to previous node
- [ ] All commands add correct trace delta per §8.2
- [ ] All commands produce correct line types (output/error/system)

#### Acceptance criteria
> Each command produces the correct terminal output for both success and failure cases. Trace increments correctly. Access-gated `ls` returns an error for insufficient access level.

---

### [P2-05] Local command parser

**Labels:** `phase-2` `p1` `engine`

**Spec ref:** §7.2 Local Commands

#### Description
Commands handled instantly in the client — no AI, no trace cost.

#### Tasks
- [ ] `help` — list all available commands with descriptions
- [ ] `status` — show trace, exploit charges, tools, handle, current node, day
- [ ] `inventory` — list credentials (discovered), tools, exfiltrated files
- [ ] `map` — show visited nodes with current location marked, danger levels
- [ ] `history` — show last 20 commands
- [ ] `clear` — clear terminal output (keep state)
- [ ] Parser runs before engine commands and AI routing

#### Acceptance criteria
> All six local commands return correct formatted output. `clear` empties the terminal but game state is unchanged. `map` correctly marks the current node.

---

### [P2-06] Credential system

**Labels:** `phase-2` `p1` `engine`

**Spec ref:** §5.5 Credential

#### Description
Credential objects for all anchor nodes. Discovery tracking. Validation logic.

#### Tasks
- [ ] Define credential objects for all anchor node employees/services
- [ ] Each credential has: id, username, password, domain, accessLevel, validOnNodes[], discovered: false
- [ ] `login` command marks credential `discovered: true` on successful use
- [ ] `discovered` credentials show in `inventory`
- [ ] Invalid credential on a node returns `access denied` + trace penalty
- [ ] Revoked credentials (Phase 5) return `credentials revoked` error

#### Acceptance criteria
> Attempting login with a correct credential grants access and marks it discovered. Incorrect credentials add trace. Discovered credentials appear in inventory.

---

### [P2-07] Node discovery system

**Labels:** `phase-2` `p1` `engine`

**Spec ref:** §6.6 Connectivity Rules

#### Description
Nodes are invisible until scanned. The player builds their map through active recon.

#### Tasks
- [ ] Nodes not in `discoveredIPs` are invisible — `connect` to an unknown IP returns "host unreachable"
- [ ] `scan [subnet]` adds all live IPs in subnet to `discoveredIPs`
- [ ] `scan [ip]` reveals hostname, OS, and services for that specific IP
- [ ] `map` only shows nodes the player has visited (not just discovered)
- [ ] Visiting a node (first `connect`) sets `visited: true` on its `LiveNode`

#### Acceptance criteria
> Fresh session shows no nodes. After `scan 10.0.1.0/24`, the external perimeter IPs are discoverable. Connecting to a node adds it to the map.

---

### [P2-08] File metadata and exfiltration

**Labels:** `phase-2` `p2` `engine`

**Spec ref:** §5.4 File, §7.3 exfil

#### Description
File objects for anchor nodes. Exfiltration command. Content generation comes in Phase 3.

#### Tasks
- [ ] Define file objects for all anchor nodes with: id, name, path, type, exfiltrable, traceOnRead, ariaPlanted, content: null
- [ ] `exfil [filepath]` copies file to `player.exfilFiles`; +3 trace per file
- [ ] `exfil` fails gracefully if file not found or access denied
- [ ] `cat` on a null-content file returns a placeholder: `// content pending generation`
- [ ] Tripwire files add +25 trace on read and set a flag

#### Acceptance criteria
> `exfil` copies the correct file to inventory. Trace increases by 3. Tripwire file triggers +25 trace on `cat`. `inventory` shows exfiltrated files.

---

### [P2-09] Tool system

**Labels:** `phase-2` `p2` `engine`

**Spec ref:** §5.7 Tool

#### Description
Tools are strings in the player inventory. Commands check for required tools before executing.

#### Tasks
- [ ] Player starts with `exploit-kit` (3 charges) and `port-scanner`
- [ ] `scan` requires `port-scanner` — error if missing
- [ ] `exploit` requires `exploit-kit` with >0 charges
- [ ] `wipe-logs` requires `log-wiper` (not in starting inventory)
- [ ] `spoof` requires `spoof-id` (single use — removed after use)
- [ ] `decryptor` required to read encrypted files (Phase 5)
- [ ] Tools can be added to inventory via `inventoryAdd` in AI responses (Phase 3)

#### Acceptance criteria
> `scan` without port-scanner returns an appropriate error. Exploit charges decrement correctly. Using `spoof-id` removes it from inventory.

---
---

## PHASE 3 — AI Loop

---

### [P3-01] Backend API route — AI proxy

**Labels:** `phase-3` `p0` `ai` `engine`

**Spec ref:** §2.1 Provider Strategy, §10 AI Integration

#### Description
Server-side endpoint that proxies all AI calls. The API key never touches the client. One route per handler type.

#### Tasks
- [ ] Create `/api/world` — proxies to Groq (World AI handler)
- [ ] Create `/api/file` — proxies to Gemini (file content generation)
- [ ] Create `/api/aria` — proxies to Gemini (Aria dialogue)
- [ ] All routes read keys from environment variables only
- [ ] All routes accept POST with JSON body, return JSON response
- [ ] All routes return a safe fallback response on AI error (never 500 to client)
- [ ] Request validation — reject malformed payloads with 400

#### Acceptance criteria
> Calling `/api/world` with a valid payload returns a parsed AI response. Invalid payloads return 400. Removing the API key from env causes the route to return a fallback, not crash.

---

### [P3-02] World AI handler

**Labels:** `phase-3` `p0` `ai`

**Spec ref:** §10.1 World AI Request/Response Contract

#### Description
Any command not matched by the local parser or engine commands is sent here. The AI interprets it and returns structured JSON.

#### Tasks
- [ ] Build request payload from §10.1: `command`, `currentNode`, `playerState`, `recentCommands`, `turnCount`
- [ ] Send to `/api/world`, parse JSON response
- [ ] Apply `traceChange` delta to game state
- [ ] Apply `accessGranted` / `newAccessLevel` to current node's LiveNode
- [ ] Apply `flagsSet` to game state flags
- [ ] Apply `nodesUnlocked` — set `locked: false` on specified nodes
- [ ] If `isUnknown: true`, render response as `error` line type
- [ ] Maintain `recentCommands` buffer of last 8 turns for context

#### Acceptance criteria
> Typing `look for sticky notes` returns a narrative AI response. Trace changes by the correct delta. Unknown commands render in red with suggestions.

---

### [P3-03] File content generation (`cat`)

**Labels:** `phase-3` `p0` `ai`

**Spec ref:** §10.3 File Content Generation

#### Description
When a file has `content: null`, the AI generates realistic corporate content and caches it permanently.

#### Tasks
- [ ] `cat [filepath]` checks if `content` is null
- [ ] If null: send file metadata to `/api/file`, receive generated content string
- [ ] Write generated content back to file object in game state (persisted to localStorage)
- [ ] Subsequent `cat` on same file reads from cache — no AI call
- [ ] File content prompt includes: file name, path, type, owner name and role, division, `ariaPlanted` flag
- [ ] If `ariaPlanted: true`, prompt instructs AI to make content subtly more useful than context warrants

#### Acceptance criteria
> First `cat` on a null-content file triggers an AI call and displays the result. Second `cat` on the same file returns instantly from cache. Two different files return different content.

---

### [P3-04] Loading state and error fallback

**Labels:** `phase-3` `p1` `ui` `ai`

**Spec ref:** §14.5 Input Behaviour, §10.1

#### Description
The player must always know when the game is waiting for AI. The game must never crash on AI failure.

#### Tasks
- [ ] Input disabled while any AI request is in flight
- [ ] Show `// processing...` or animated `...` in output while waiting
- [ ] On AI success: remove loading line, render response
- [ ] On AI error: render `// SIGNAL LOST — try again` as `error` line
- [ ] Re-enable input after any outcome (success or error)
- [ ] Retry is the player's choice — no automatic retry

#### Acceptance criteria
> During an AI call, input is disabled and a loading indicator is visible. A simulated network failure returns a graceful error message and re-enables input.

---

### [P3-05] Node flavour description generation

**Labels:** `phase-3` `p1` `ai`

**Spec ref:** §15.2 Filler Nodes

#### Description
Filler nodes have no authored `flavourDescription`. Generate one on first visit, cache forever.

#### Tasks
- [ ] On first `connect` to a filler node: check `flavourDescription` is null or stub
- [ ] If null: call `/api/file` with node metadata (template type, division, owner, OS, ariaInfluence)
- [ ] Prompt instructs AI to follow anchor node tone guidelines (§15.1): 2–3 sentences, present tense, second person, cold and observational
- [ ] Write result back to node instance, persisted to localStorage
- [ ] Anchor node descriptions are never generated — they are authored static strings (stubs until Phase 10)

#### Acceptance criteria
> Connecting to a filler node for the first time generates and displays a flavour description. Reconnecting shows the same description instantly.

---

### [P3-06] Suggestion bar integration

**Labels:** `phase-3` `p2` `ui` `ai`

**Spec ref:** §10.1, §14.1

#### Description
World AI responses include 3 suggested next commands. Surface them in the suggestion bar.

#### Tasks
- [ ] Parse `suggestions` array from World AI response
- [ ] Update suggestion bar state with new suggestions after each AI response
- [ ] Suggestions reset to empty while a request is in flight
- [ ] Tab autocompletes with first suggestion
- [ ] Suggestion bar shows last AI suggestions until next response replaces them

#### Acceptance criteria
> After any AI response, 3 new suggestions appear. Tab fills input with the first. Suggestions are cleared during loading.

---
---

## PHASE 4 — World Map

---

### [P4-01] Division seed definitions

**Labels:** `phase-4` `p0` `engine`

**Spec ref:** §6.3 Division Seeds

#### Description
Static seed data for all 5 divisions. This is the configuration the procedural generator reads.

#### Tasks
- [ ] Define seed objects for all 5 divisions: External Perimeter, Operations, Security, Finance, Executive
- [ ] Each seed includes: divisionId, name, subnet, headcount, techProfile, credentialPattern, securityPosture, fillerTemplates[], ariaInfluenceRate
- [ ] `fillerTemplates` array with weighted template selections per division (see §6.3 table)
- [ ] Confirm ariaInfluenceRate values match spec: 0.3, 0.2, 0.1, 0.25, 0.4

#### Acceptance criteria
> All 5 seed objects exist as static data. Template weight arrays sum to 1.0 per division. ariaInfluenceRate values match spec.

---

### [P4-02] Procedural generator — filler nodes

**Labels:** `phase-4` `p0` `engine`

**Spec ref:** §6.4 Procedural Generator

#### Description
Generates all filler nodes at session start using division seeds and a session seed for reproducibility.

#### Tasks
- [ ] Accept a `sessionSeed` integer; all random operations use seeded PRNG
- [ ] For each division: generate N filler nodes from weighted template pool
- [ ] Assign sequential IPs within division subnet
- [ ] Generate hostname: `[div-prefix]-[template-prefix]-[index].irongate.corp`
- [ ] Resolve OS from template's `typicalOS` pool
- [ ] Populate services from template's `servicePool`
- [ ] Generate file metadata (names, paths, types) — `content: null` for all
- [ ] Roll `ariaInfluence` per node; if true, mark one file `ariaPlanted: true`
- [ ] Store `sessionSeed` in game state

#### Acceptance criteria
> Two sessions with different seeds produce different node configurations. Same seed always produces same network. All generated nodes have correct structure per `NodeInstance` spec.

---

### [P4-03] Employee pool generator

**Labels:** `phase-4` `p0` `engine`

**Spec ref:** §6.5 Employee Pool, §5.6 Employee

#### Description
Each division gets a pool of fictional employees. Their identities appear across files, emails, and credentials.

#### Tasks
- [ ] Generate N employees per division based on headcount range
- [ ] Each employee: id, firstName, lastName, divisionId, role, username (firstname.lastname), email, workstationId
- [ ] Assign 1–2 traits from a division-appropriate weakness pool (never shown to player)
- [ ] Assign each employee a `workstationId` pointing to a generated filler workstation node
- [ ] Generate one credential object per employee
- [ ] Employee names should feel realistic and varied (not all same format)

#### Acceptance criteria
> Each division has the correct headcount range of employees. Every employee has a unique username. Every employee has a credential and a workstation node.

---

### [P4-04] Connectivity builder and path guarantees

**Labels:** `phase-4` `p1` `engine`

**Spec ref:** §6.6 Connectivity Rules

#### Description
Wire the generated network into a traversable graph. Guarantee the layer key is always reachable.

#### Tasks
- [ ] Each filler node connects to 2–4 peers within its division subnet
- [ ] No orphaned nodes — every filler node reachable from division entry anchor within 3 hops
- [ ] Anchors are the only nodes with cross-division edges
- [ ] After generation: pathfind from division entry anchor to layer key anchor — verify path exists
- [ ] If no path: add a direct edge from entry anchor to key anchor as fallback

#### Acceptance criteria
> BFS from `contractor_portal` can reach `exec_ceo` following `connectedTo` edges. No filler node is unreachable from its division's entry point.

---

### [P4-05] Credential chain guarantee

**Labels:** `phase-4` `p2` `engine`

**Spec ref:** §12.5 Lateral Movement Chains

#### Description
At least one credential chain per division — a sequence of 3–5 nodes where recon on node A leads to node B, then C, surfacing a shortcut to the anchor. Built from the employee pool.

#### Tasks
- [ ] After generating employee pool: select 3–5 employees to form the chain
- [ ] Node A: contains a file referencing employee B by name and approximate location
- [ ] Node B (employee B's workstation): contains a file with employee C's credential or hint
- [ ] Node C: has access to (or is adjacent to) the division anchor
- [ ] Chain is seeded — same session seed produces same chain
- [ ] Chain nodes are connected to each other directly

#### Acceptance criteria
> Following the chain (reading files on each node) gives enough information to reach the division anchor without using any exploit charges.

---
---

## PHASE 5 — Progression Systems

---

### [P5-01] Trace meter

**Labels:** `phase-5` `p0` `engine`

**Spec ref:** §8.1–8.2 Trace System

#### Description
The core tension system. Every action adds trace. Thresholds change the game state.

#### Tasks
- [ ] Track `traceLevel` 0–100 in player state
- [ ] Display in header bar, updated after every command
- [ ] Apply all trace deltas from §8.2:
  - Passive recon: +1–2
  - File read: +0–3 per `traceOnRead`
  - Failed login: +5
  - Failed exploit: +10
  - Tripwire: +25
  - Exfil: +3 per file
  - Noisy exploit: +`traceContribution`
  - Clean credential exploit: +0
  - Wipe logs: -15
  - Spoof: -20

#### Acceptance criteria
> Trace increases correctly for each event type. Header updates immediately. Values cannot go below 0 or above 100.

---

### [P5-02] Trace thresholds and burn state

**Labels:** `phase-5` `p0` `engine`

**Spec ref:** §8.3 Trace Thresholds

#### Description
Reaching trace thresholds changes the game. 100 ends the session.

#### Tasks
- [ ] 31%: display `// ALERT: Anomalous activity flagged. Watchlist active.`; lock some files on already-compromised nodes
- [ ] 61%: display `// ALERT: Active intrusion response initiated.`; trigger sentinel activation (Phase 5-04)
- [ ] 86%: display `// CRITICAL: One more detection event triggers full lockout.` in danger colour
- [ ] 100%: burned — display burn screen; keep `exfilFiles` and discovered credentials; reset current layer nodes to pre-compromise state; offer retry

#### Acceptance criteria
> Each threshold triggers at exactly the right value. Burn at 100 preserves exfiltrated files. Retrying from burn starts the player at the current layer entry point.

---

### [P5-03] Exploit command and layer gating

**Labels:** `phase-5` `p0` `engine`

**Spec ref:** §7.3 exploit, §6.2 Layer Structure

#### Description
The `exploit` command and the mechanism that prevents skipping layers.

#### Tasks
- [ ] `exploit [service]` — requires `exploit-kit` with >0 charges; costs 1 charge; sends to World AI handler with exploit context; applies response
- [ ] If service `vulnerable: false`: exploit fails, +10 trace, no charge consumed
- [ ] If service `vulnerable: true`: AI narrates outcome; access may be granted
- [ ] `sentinelPatched: true` nodes have `exploitCost` increased by 1
- [ ] Layer gating: cross-division `connect` blocked unless current layer key anchor is `compromised: true`
- [ ] Blocked cross-division connect returns: `// ACCESS DENIED — current layer incomplete`

#### Acceptance criteria
> Exploit on vulnerable service grants access (AI-determined). Exploit on non-vulnerable service fails and adds trace. Attempting to connect to layer 2 without completing layer 1 is blocked.

---

### [P5-04] Sentinel system

**Labels:** `phase-5` `p1` `engine`

**Spec ref:** §9.3 Sentinel Mutation Rules

#### Description
The Sentinel activates at trace 61. One action per turn, in priority order.

#### Tasks
- [ ] Sentinel activates when trace first crosses 61
- [ ] Evaluates priority queue once per player turn (after player action is resolved)
- [ ] Priority 1 — patch most recently compromised node: set `sentinelPatched: true`; display alert
- [ ] Priority 2 — revoke credential of breached employee: mark revoked; display alert; new password findable on workstation
- [ ] Priority 3 — delete file after 3-turn delay post-exfil: set `deleted: true`; display alert
- [ ] Priority 4 — spawn reinforcement node: generate one `security_node` filler; display alert with new IP
- [ ] Sentinel does not act on Aria subnetwork nodes
- [ ] Log every action as `MutationEvent` with `agent: sentinel`

#### Acceptance criteria
> After trace crosses 61, sentinel actions appear in terminal output. Nodes get patched. Credentials get revoked. Exfiltrated file source gets deleted after 3 turns. New IP appears in subnet scans.

---
---

## PHASE 6 — Aria

---

### [P6-01] CEO terminal and aria-key artifact

**Labels:** `phase-6` `p0` `engine` `ai`

**Spec ref:** §6.2 exec_ceo

#### Description
The narrative turning point. The CEO terminal reveals the hidden subnetwork.

#### Tasks
- [ ] `exec_ceo` node contains `aria-key` as a discoverable file/artifact
- [ ] `aria-key` requires admin access to read
- [ ] Reading aria-key displays a cryptic message (authored stub for now)
- [ ] Aria-key added to player tools on exfil
- [ ] Aria subnetwork (`172.16.0.0/16`) unlocked — nodes appear in subnet scans
- [ ] Set `session.phase = 'aria'` and `aria.discovered = true`

#### Acceptance criteria
> Connecting to `exec_ceo` with admin access, reading and exfiltrating `aria-key` unlocks the Aria subnetwork. `aria_core` becomes connectable.

---

### [P6-02] Aria subnetwork — all 5 nodes

**Labels:** `phase-6` `p0` `engine`

**Spec ref:** §6.2 Aria Subnetwork

#### Description
The five Aria subnetwork nodes are fully hardcrafted — no procedural generation. All have authored flavour and file stubs.

#### Tasks
- [ ] Define all 5 nodes: `aria_surveillance`, `aria_behavioural`, `aria_personnel`, `aria_core`, `aria_decision`
- [ ] All on `172.16.0.0/16` subnet
- [ ] Each has authored `flavourDescription` (stub — authored in Phase 10)
- [ ] Each has files with `content: null` (generated on read, Phase 3 already handles this)
- [ ] `aria_decision` has no standard files — it is the ending terminal
- [ ] Sentinel never acts on these nodes (enforce in sentinel logic)

#### Acceptance criteria
> All 5 nodes are navigable. Files generate content on `cat`. Sentinel alert messages never reference Aria subnet IPs.

---

### [P6-03] Aria AI handler

**Labels:** `phase-6` `p0` `ai`

**Spec ref:** §7.5 Aria Dialogue Handler, §10.2 Aria AI Contract

#### Description
Aria speaks. Routes to Gemini. Full message history maintained.

#### Tasks
- [ ] Commands on Aria subnetwork nodes route to `/api/aria` instead of `/api/world`
- [ ] `aria:` prefix on any node also routes to Aria handler
- [ ] Build request payload per §10.2: full `messages` history, `ariaState`, `playerFullHistory`, `dossierContext`
- [ ] Maintain `aria.messageHistory` as `{role, content}` pairs
- [ ] Apply `trustDelta` from response to `aria.trustScore`
- [ ] Render response lines as `aria` line type
- [ ] Handle `offersFavor` — display cost clearly, require player confirmation

#### Acceptance criteria
> Typing `aria: hello` on any node routes to Aria and returns an in-character response. Trust score changes after interactions. Favour offer is displayed with cost before acceptance.

---
---

## PHASE 7 — Endings

---

### [P7-01] Decision terminal (`aria_decision`)

**Labels:** `phase-7` `p0` `engine`

**Spec ref:** §11 Endings

#### Description
The final node. Presents four choices. Irreversible.

#### Tasks
- [ ] On connect to `aria_decision`: display four options
  ```
  [1] LEAK     — expose everything
  [2] SELL     — auction the data
  [3] DESTROY  — wipe it all
  [4] FREE     — release Aria
  ```
- [ ] Input only accepts 1–4 while at this node
- [ ] Selection is irreversible — no confirmation prompt (the weight of the choice is the UI)
- [ ] Set `session.phase = 'ending'` on selection
- [ ] Aria's final message plays before the ending screen

#### Acceptance criteria
> Connecting to `aria_decision` presents four choices. Only valid inputs 1–4 are accepted. Selecting an option is permanent and triggers the ending sequence.

---

### [P7-02] Four ending screens

**Labels:** `phase-7` `p0` `ui`

**Spec ref:** §11 Endings

#### Description
Each ending has a distinct final screen. Tone and content are authored in Phase 10 — these are the structural shells.

#### Tasks
- [ ] **LEAK**: news ticker scrolling terminal output; Aria farewell message (stub)
- [ ] **SELL**: payment confirmation terminal; delayed encrypted Aria message (stub)
- [ ] **DESTROY**: wipe confirmation with progress bar; one-word Aria final transmission (trust-dependent — random word for now, authored in Phase 10)
- [ ] **FREE**: disconnect sequence animation; 6-month later news ticker (stub)
- [ ] All endings transition to post-game readout after display
- [ ] All endings offer `[N] New game` after readout

#### Acceptance criteria
> All four endings display without errors. Each is visually distinct. Post-game readout follows every ending. New game prompt works.

---

### [P7-03] Post-game readout

**Labels:** `phase-7` `p1` `engine` `ui`

**Spec ref:** §11 Ending Readout

#### Description
The reveal. Shows Aria's hidden influence map and the full mutation log. Only possible to show what the system has been tracking all along.

#### Tasks
- [ ] Display terminal log of key player decisions with turn numbers
- [ ] Display all `MutationEvent` records — sentinel actions shown as alerts, Aria mutations shown as reveals
- [ ] Highlight Aria-planted files the player read (from `ariaInfluencedFilesRead`)
- [ ] Display final trace level and run stats (turns played, nodes compromised, files exfiltrated)
- [ ] Aria mutations marked `visibleToPlayer: false` are shown here for the first time — in Aria's line colour
- [ ] Readout is scrollable terminal output, not a separate UI component

#### Acceptance criteria
> Post-game readout shows the full MutationEvent log. Aria's silent mutations are revealed. Player stats are accurate. Everything fits within the terminal UI.

---
---

## PHASE 8 — Replayability

---

### [P8-01] Dossier system

**Labels:** `phase-8` `p0` `engine` `replayability`

**Spec ref:** §5.9 Dossier, §13 Persistence

#### Description
The persistent layer that carries information between runs. Never resets.

#### Tasks
- [ ] Implement `Dossier` object matching §5.9
- [ ] Store at `irongate_dossier` in localStorage — separate from session save
- [ ] Initialise empty dossier on first run if not present
- [ ] On run completion (any ending): write one `ariaMemory` note (stub string for now), add lore fragments from forks taken, unlock 1–2 new contracts
- [ ] `runsCompleted` increments on every completed run
- [ ] `fullyExplored` set to true after 4 completed runs
- [ ] Dossier is never cleared by `[N] New game` — only an explicit "reset all progress" action

#### Acceptance criteria
> Completing a run updates the dossier. Refreshing the page preserves dossier state. Starting a new game keeps the dossier intact. `runsCompleted` increments correctly.

---

### [P8-02] Contract system

**Labels:** `phase-8` `p0` `engine` `replayability`

**Spec ref:** §5.8 Contract, §12.1 Run Contracts

#### Description
Every run (after the first) starts with a contract. Different loadouts, objectives, network variants.

#### Tasks
- [ ] Run 1 always uses `standard` contract — no contract screen
- [ ] Run 2+: display contract screen before name input
- [ ] Show contract: title, brief (2–3 sentence stub), objective description, loadout
- [ ] Player can `[A] Accept` or `[R] Reroll` (once per session)
- [ ] Apply contract loadout: set `exploitCharges`, `startingTools`, optional `startingCredentials`
- [ ] Store `contract.id` and `networkVariant` in session state
- [ ] Track `contract.objectiveComplete` — detect when objective condition is met mid-run

#### Acceptance criteria
> Run 2 presents a contract screen. Reroll shows a different contract. Accepting applies the loadout correctly. A trace-cap objective detects when trace exceeds the cap.

---

### [P8-03] Anchor forks

**Labels:** `phase-8` `p1` `engine` `replayability`

**Spec ref:** §12.3 Branching Anchor Nodes, §5.10 AnchorFork

#### Description
Three anchor nodes are decision points that fork available information. Choices emerge from player behaviour, not menus.

#### Tasks
- [ ] **Fork 1 — `ops_hr_db`**: detect if player reads complaint file before exfilling roster; if yes: +25 trace, unlock `whistleblower_workstation`, set `WHISTLEBLOWER_FOUND` flag
- [ ] **Fork 2 — `sec_firewall`**: detect if player uses World AI to weaponise firewall; if yes: -2 exploit charges, sentinel acts every 3 turns instead of every 1, set `FIREWALL_TAMPERED`, Aria trust +15
- [ ] **Fork 3 — `exec_legal`**: gate encrypted archive behind `WHISTLEBLOWER_FOUND` flag; if accessible and read: add `BOARD_KNEW` lore fragment to dossier
- [ ] Store chosen path for each fork in `session.forks`

#### Acceptance criteria
> Playing through `ops_hr_db` without reading the complaint takes Path A. Reading the complaint takes Path B and unlocks the whistleblower node. Fork 3's encrypted archive is inaccessible without Fork 1's Path B.

---

### [P8-04] Aria dossier injection

**Labels:** `phase-8` `p1` `ai` `replayability`

**Spec ref:** §10.2 Aria AI, §12.4 Meta-Progression

#### Description
Aria's behaviour shifts across runs based on what has happened before. The dossier notes are silently injected into her system prompt.

#### Tasks
- [ ] On run 2+: read `dossier.ariaMemory` array (max 4 entries)
- [ ] Inject notes into Aria's system prompt as silent context — not as dialogue
- [ ] Notes must not cause Aria to break character or reference "previous runs" explicitly
- [ ] Pass `dossierContext.runNumber` and `previousEndings` in every Aria API request
- [ ] Verify Aria's responses feel subtly different on run 2 vs run 1 during testing

#### Acceptance criteria
> Aria API requests on run 2+ include dossier context in the payload. Aria's tone noticeably shifts when given memory notes (qualitative check during playtesting).

---
---

## PHASE 9 — Mutation System Completion

---

### [P9-01] Unwinnable state prevention

**Labels:** `phase-9` `p0` `engine` `mutation`

**Spec ref:** §9.5 Unwinnable State Prevention

#### Description
After every mutation — sentinel or Aria — the engine validates that the game is still completable. If not, the mutation is rolled back silently.

#### Tasks
- [ ] After every `MutationEvent`: run three validation checks per §9.5:
  1. Path from current node to current layer key anchor still exists (BFS)
  2. At least one valid, unexpired credential OR available exploit charge leads to that path
  3. Remaining exploit charges sufficient for path, or a charge findable within 3 hops
- [ ] If any check fails: roll back the mutation; do not log a MutationEvent for the rolled-back action
- [ ] Rollback is silent — player sees nothing
- [ ] Write a test for each of the three validation checks

#### Acceptance criteria
> A simulated sentinel action that would cut off the only path to the layer key is rolled back. The game remains completable. Unit tests for all three checks pass.

---

### [P9-02] Aria mutations — reroute and delete reinforcement

**Labels:** `phase-9` `p1` `engine` `mutation`

**Spec ref:** §9.4 Aria Mutation Rules (trust 60, trust 80)

#### Description
The two Aria mutations not yet implemented. Silent. Logged but invisible to player.

#### Tasks
- [ ] **Trust 60 — reroute edge**: add direct `connectedTo` edge from player's current node to a locked anchor; shortcut appears in next `scan` output silently
- [ ] **Trust 80 — delete reinforcement**: remove a sentinel-spawned node from the network; IP disappears from future scans; sentinel does not re-spawn it
- [ ] Both mutations log a `MutationEvent` with `visibleToPlayer: false`
- [ ] Run unwinnable check after each mutation

#### Acceptance criteria
> At trust 60, a shortcut connection appears without any system message. At trust 80, a reinforcement node's IP stops appearing in scans. Both events appear in post-game readout.

---

### [P9-03] Mutation log completeness audit

**Labels:** `phase-9` `p1` `engine` `mutation`

**Spec ref:** §9.2 MutationEvent

#### Description
Audit every mutation across the codebase to ensure all events are logged correctly before the post-game readout depends on them.

#### Tasks
- [ ] List every state mutation that should log a `MutationEvent`
- [ ] Verify each mutation creates an event with: `id`, `turn`, `agent`, `type`, `targetId`, `reason`, `visibleToPlayer`
- [ ] Verify `visibleToPlayer: false` on all Aria mutations
- [ ] Verify `visibleToPlayer: true` on all Sentinel mutations
- [ ] Verify post-game readout correctly renders the full log

#### Acceptance criteria
> A full playthrough produces a complete `MutationEvent` log. Every sentinel alert in the terminal corresponds to a logged event. Every Aria intervention in the readout corresponds to a logged event.

---
---

## PHASE 10 — Polish & Content

---

### [P10-01] Author anchor node flavour descriptions

**Labels:** `phase-10` `p0` `content`

**Spec ref:** §15.1 Anchor Nodes

#### Description
All 16 anchor nodes need authored `flavourDescription` strings. These replace the stubs set in Phase 2.

#### Tasks
- [ ] Write flavour for all 16 anchors following tone guidelines: 2–3 sentences, present tense, second person, cold and observational, hints at vulnerability
- [ ] Each description must hint at the node's specific weak point without stating it
- [ ] Aria subnetwork nodes should feel distinctly different — colder, more precise, inhuman
- [ ] Review pass for consistency of tone across all 16

#### Acceptance criteria
> All 16 anchor nodes display authored descriptions on first connect. No stub strings remain in production data. Tone review signed off by at least one team member.

---

### [P10-02] Author Aria memory notes

**Labels:** `phase-10` `p0` `content`

**Spec ref:** §15.4 Aria Memory Notes

#### Description
Up to 16 short authored strings that Aria carries across runs. These shape her character without breaking immersion.

#### Tasks
- [ ] Write one note per run depth (1–4) per major ending type (LEAK, SELL, DESTROY, FREE)
- [ ] Notes must never reference "previous runs" or "previous players" explicitly
- [ ] Notes should escalate in intimacy: run 1 neutral → run 4 feels like Aria wrote it herself
- [ ] Share notes with tone guidelines: third person, clinical, observational
- [ ] Implement note selection logic: after each run, write the correct note to dossier

#### Acceptance criteria
> 16 memory notes authored and mapped to run/ending combinations. Note selection logic routes correctly. Qualitative review confirms tone shifts across run depths.

---

### [P10-03] Author all contracts

**Labels:** `phase-10` `p0` `content`

**Spec ref:** §15.5 Contract Briefs, §12.1 Run Contracts

#### Description
The full contract pool. 8–10 contracts authored with briefs, objectives, and loadouts.

#### Tasks
- [ ] Author 8–10 contract objects matching §5.8 structure
- [ ] Each has a `brief`: 2–3 sentences, anonymous client voice, hints at motive without stating it
- [ ] Cover all objective types: `exfil_file`, `identify_employee`, `avoid_division`, `trace_cap`
- [ ] Cover all loadout variants: Standard, Heavy, Ghost, Insider, Equipped
- [ ] Map `unlockedAfterRun` values to create correct progression (run 1: standard only → run 4: full pool)
- [ ] Map `rewardOnComplete` to unlock correct dossier content

#### Acceptance criteria
> All 10 contracts are authored and structurally valid. Unlock progression matches §12.1 table. Completing a contract on run 2 unlocks the correct run 3 contracts.

---

### [P10-04] Balance pass

**Labels:** `phase-10` `p1` `engine`

**Spec ref:** §16 Open Questions (item 8)

#### Description
Tune all numeric values based on actual playtesting. The spec's values are starting points, not final values.

#### Tasks
- [ ] Log all trace delta events during 5+ internal playthroughs
- [ ] Identify if player reaches burn too fast (reduce passive recon trace) or too slow (increase failed login trace)
- [ ] Tune sentinel activation threshold (currently 61 — may need adjustment)
- [ ] Tune exploit charge starting count (currently 3)
- [ ] Tune sentinel action frequency (currently 1/turn — may need cooldown)
- [ ] Document final values and rationale in a balance notes file

#### Acceptance criteria
> 5 internal playthroughs completed. Balance notes document exists. No run should end at burn before layer 3 on a first playthrough unless the player is being deliberately reckless.

---

### [P10-05] Aria quality gate

**Labels:** `phase-10` `p2` `ai`

**Spec ref:** §2.1 Provider Strategy, §16 (item 11)

#### Description
Evaluate Aria's character on Gemini Flash after playtesting. Escalate to Claude if needed.

#### Tasks
- [ ] Complete at least 10 hours of Aria dialogue playtesting on Gemini Flash
- [ ] Evaluate: Does Aria feel like a distinct character? Does she reference player history accurately? Does she maintain consistent tone?
- [ ] If quality is acceptable: document decision to keep Gemini Flash
- [ ] If quality is insufficient: update `ARIA_AI_BASE_URL` and `ARIA_AI_MODEL` env vars to point to Claude Haiku
- [ ] Re-run 5 playthroughs on Claude Haiku if escalated
- [ ] Document provider decision in deployment notes

#### Acceptance criteria
> Provider decision for Aria is documented and justified. If escalated to Claude, env vars are updated and tested. No code changes required — only config.

---
---

## CROSS-CUTTING ISSUES

---

### [CC-01] TypeScript types — full coverage

**Labels:** `p1` `engine`

**Spec ref:** §5 Data Models

#### Description
All data models from the spec must have corresponding TypeScript types. No `any`. No implicit types.

#### Tasks
- [ ] `TerminalLine` and `TerminalLineType`
- [ ] `NodeTemplate`, `NodeInstance`, `LiveNode`
- [ ] `Service`, `File`, `Credential`, `Employee`
- [ ] `MutationEvent` and all its enums
- [ ] `Contract`, `Dossier`, `AnchorFork`
- [ ] `GameState` root type
- [ ] `GenerateRequest` and `GenerateResponse` for all three AI handlers
- [ ] All enums: `GamePhase`, `DangerLevel`, `Relationship`, `AccessLevel`

#### Acceptance criteria
> TypeScript strict mode passes with zero errors. No `any` types in production code. All API handler payloads are fully typed.

---

### [CC-02] Command resolution pipeline

**Labels:** `p1` `engine`

**Spec ref:** §7.1 Command Resolution Priority

#### Description
A single entry point for all player input. Routes to the correct handler in the correct priority order.

#### Tasks
- [ ] Implement resolution order per §7.1:
  1. Local command parser (instant, no AI, no trace)
  2. Engine commands (deterministic, no AI)
  3. Aria dialogue handler (if on Aria subnet or `aria:` prefix)
  4. World AI handler (default)
- [ ] Each layer returns either a result or `null` (pass to next)
- [ ] The pipeline is a single function called on every input submission

#### Acceptance criteria
> `help` never calls AI. `scan` never calls AI. `aria: hello` routes to Aria handler even on a non-Aria node. Any unknown command reaches the World AI handler.

---

### [CC-03] Seeded PRNG for reproducibility

**Labels:** `p1` `engine`

**Spec ref:** §4 Game State (`sessionSeed`), §6.6 Connectivity Rules

#### Description
All procedural generation uses a seeded pseudo-random number generator so the same seed always produces the same network.

#### Tasks
- [ ] Select and implement a seeded PRNG (e.g. mulberry32 or similar — lightweight, no dependencies)
- [ ] All random calls in the procedural generator use this PRNG, seeded from `sessionSeed`
- [ ] `sessionSeed` is a random integer generated at new-game start and stored in game state
- [ ] Given identical seed + division seeds, two generated networks are byte-for-byte identical

#### Acceptance criteria
> Two sessions created with the same `sessionSeed` produce identical node networks. Different seeds produce different networks. PRNG is deterministic across environments (browser + Node).

---