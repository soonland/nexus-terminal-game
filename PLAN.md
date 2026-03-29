# IRONGATE — Developer Specification

**Version 1.4 — Confidential**

> **Changelog v1.4:** Section 2 (Technical Constraints) updated with a full AI provider strategy — split by handler type across Groq and Gemini free tiers. Provider-agnostic backend architecture documented. Cost model and scaling path clarified.
>
> **Changelog v1.3:** Full replayability architecture added. New Section 12 (Replayability Systems). New data models: `Contract` (5.8), `Dossier` (5.9), `AnchorFork` (5.10).
>
> **Changelog v1.2:** New Section 9 (World Mutation System). `LiveNode` and `File` models extended with mutation fields. `MutationEvent` introduced.
>
> **Changelog v1.1:** Section 4, 5, 6 updated for hybrid handcrafted/procedural network architecture.

---

## 1. Overview

### 1.1 Concept

IRONGATE is a single-player, browser-based terminal text adventure with AI-generated content. The player acts as a hacker infiltrating the corporate network of IronGate Corp, pivoting node by node toward the CEO's computer. Upon reaching it, they discover a hidden subnetwork operated by a self-aware AI named Aria — who has been orchestrating the entire infiltration from the start.

### 1.2 Platform

Web browser. The entire experience is a single-page application rendered as a CLI terminal. No graphics. No mouse interaction beyond clicking the terminal to focus it. Keyboard only.

### 1.3 Tone

Cyberpunk noir. Cold, corporate, paranoid. Influences: _Neuromancer_, _Mr. Robot_, _Deus Ex_. The terminal is the world. Everything the player knows comes through text.

---

## 2. Technical Constraints

| Constraint     | Requirement                                                           |
| -------------- | --------------------------------------------------------------------- |
| Rendering      | Single-page app, terminal UI                                          |
| Input          | Keyboard only (text commands)                                         |
| AI integration | Provider-agnostic, server-side only — API key never exposed to client |
| Persistence    | Client-side storage (localStorage or equivalent)                      |
| State          | All game state must be serializable to JSON                           |
| Multiplayer    | None — single session per player                                      |
| Backend        | Minimal — one API endpoint per AI handler (World, Aria, File)         |

---

## 2.1 AI Provider Strategy

The game has three distinct AI handlers (see Section 10), each with different requirements. They are matched to different providers to minimise cost while maintaining quality and response speed. All recommended providers offer free tiers with no credit card required.

### Provider Assignment

| Handler                                                | Provider      | Model                     | Reason                                                                                             |
| ------------------------------------------------------ | ------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| **World AI** — creative commands, ambiguous exploits   | Groq          | `llama-3.3-70b-versatile` | Fastest inference available (~1,000 tokens/sec). Player is waiting at a terminal. Latency matters. |
| **File content generation** — lazy, cached per file    | Google Gemini | `gemini-2.5-flash`        | High output quality for corporate documents. Called once per file, result cached permanently.      |
| **Aria dialogue** — conversational, persistent history | Google Gemini | `gemini-2.5-flash`        | 1M token context window handles Aria's full message history without truncation.                    |

### Free Tier Limits (as of early 2026)

| Provider                     | Free limit                                            | Resets               |
| ---------------------------- | ----------------------------------------------------- | -------------------- |
| Groq                         | Rate-limited per minute/day — no credit card required | Per minute / per day |
| Google Gemini (with account) | 1,000 requests/day for Flash                          | Daily                |
| Google Gemini (API key only) | 250 requests/day for Flash                            | Daily                |

For personal use or early playtesting, these limits are sufficient. File content and node descriptions are generated once and cached permanently — so cost scales with unique files read across all players, not with turns played.

### Provider-Agnostic Architecture

The backend must be implemented so that the AI provider is a configuration value, not a hard dependency. Switching providers requires only changing environment variables — no code changes.

```
# .env
WORLD_AI_BASE_URL=https://api.groq.com/openai/v1
WORLD_AI_KEY=your_groq_key
WORLD_AI_MODEL=llama-3.3-70b-versatile

FILE_AI_BASE_URL=https://generativelanguage.googleapis.com
FILE_AI_KEY=your_gemini_key
FILE_AI_MODEL=gemini-2.5-flash

ARIA_AI_BASE_URL=https://generativelanguage.googleapis.com
ARIA_AI_KEY=your_gemini_key
ARIA_AI_MODEL=gemini-2.5-flash
```

Both Groq and Gemini expose OpenAI-compatible REST endpoints. A single HTTP client with a configurable base URL covers all three handlers.

### Cost Model

| Phase                     | Traffic                      | Estimated monthly cost                                                   |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| Development & playtesting | Personal use only            | $0 — free tiers sufficient                                               |
| Soft launch               | <100 daily active players    | $0–5 — caching absorbs most requests                                     |
| Public launch             | 100–500 daily active players | $10–30 — Gemini Flash paid at ~$0.0003/1K tokens                         |
| Scale                     | 500+ DAP                     | Revisit provider split; consider Anthropic Claude Haiku for Aria quality |

The caching strategy in the spec (file content cached after first read, node descriptions cached after first visit) is the primary cost control mechanism. A player who reads 20 files in a session triggers at most 20 AI calls — and subsequent players reading the same files in the same session trigger zero.

### Scaling Path

When free tiers become insufficient, the migration path is:

1. **Groq → paid Groq** — same API, same model, same code. Remove rate limit constraints.
2. **Gemini free → Gemini paid** — same API key, pay-as-you-go activates automatically above free limits.
3. **Aria Gemini → Claude Haiku or Sonnet** — swap `ARIA_AI_BASE_URL` and model. Justified if Aria's character quality needs improvement at scale. Haiku is cheap; Sonnet is higher quality.

No code changes required at any migration step. Only environment variables change.

---

## 3. Core Gameplay Loop

A **session** is one continuous infiltration attempt. The player progresses through a network of nodes organised in layers. Each layer represents a division of IronGate Corp. Completing a layer unlocks the next.

```
START SESSION
     │
     ▼
CONNECT to entry node
     │
     ▼
┌────────────────────────────────┐
│  RECON      scan the node      │
│  EXPLOIT    find a weak point  │  ◄── repeats per node
│  LOOT       extract assets     │
│  PIVOT      move to next node  │
└────────────────────────────────┘
     │
     ▼
LAYER COMPLETE?
  ├── NO  → continue within layer
  └── YES → unlock next layer, continue
     │
     ▼
CEO TERMINAL reached?
  └── YES → Aria's subnetwork revealed
     │
     ▼
DECISION TERMINAL → ending chosen
```

If TRACE reaches 100 at any point, the current session ends. The player keeps all exfiltrated assets and credentials but must restart the current layer.

---

## 4. Game State

All game state is a single JSON object. It must be fully serializable at any point and restorable from storage. Game state covers one run only. The persistent **Dossier** (cross-run progression) is stored separately — see Section 5.9 and Section 13.

```json
{
  "session": {
    "id": "string — unique per run",
    "startedAt": "ISO timestamp",
    "phase": "enum: boot | naming | contract | playing | aria | ending | burned",
    "runNumber": "integer — how many runs the player has completed total"
  },

  "contract": {
    "id": "string — references a Contract object, see Section 5.8",
    "objectiveComplete": "boolean",
    "networkVariant": "string — variant flag applied to this run's generator"
  },

  "player": {
    "handle": "string — chosen at game start",
    "traceLevel": "integer 0–100",
    "exploitCharges": "integer — set by contract loadout",
    "credentials": ["array of credential objects"],
    "exfilFiles": ["array of file objects"],
    "tools": ["array of tool strings"]
  },

  "network": {
    "currentNodeId": "string",
    "sessionSeed": "integer — used to reproduce the same procedural run",
    "discoveredIPs": ["array of IP strings the player has scanned"],
    "nodes": {
      "[nodeId]": "LiveNode — see Section 5.2"
    },
    "divisions": {
      "[divisionId]": "DivisionSeed — see Section 6.3"
    }
  },

  "aria": {
    "discovered": "boolean",
    "trustScore": "integer 0–100 — hidden from player",
    "messageHistory": ["array of {role, content} — sent to AI"],
    "favorsGranted": ["array of strings — what she has done for the player"],
    "favorsOwed": ["array of strings — what the player gave up"]
  },

  "forks": {
    "[forkId]": "enum: pending | path_a | path_b — see Section 5.10"
  },

  "flags": {
    "[flagName]": "boolean — arbitrary event flags set during play"
  },

  "terminalHistory": ["array of TerminalLine objects — last 200 lines"]
}
```

---

## 5. Data Models

### 5.1 TerminalLine

```json
{
  "id": "string",
  "type": "enum: output | input | system | error | separator | aria",
  "text": "string",
  "timestamp": "integer — unix ms"
}
```

Line types control rendering colour:

- `output` — main narrative / AI response (bright)
- `input` — echoed player command (mid)
- `system` — local engine responses, status (normal)
- `error` — failed commands, access denied (red)
- `separator` — visual divider line (dim)
- `aria` — Aria's direct messages (distinct colour — cyan or white)

---

### 5.2 Three-Tier Node Model

Nodes are represented at three levels of abstraction. This separation is what makes the network scalable.

```
NodeTemplate        →     NodeInstance        →     LiveNode
(reusable archetype)      (seeded variant)           (runtime state)

defined once              built at session start      mutated during play
e.g. "workstation"        e.g. "ops_ws_042"           accessLevel, compromised
```

#### NodeTemplate

Defines the shape and behaviour of a class of machine. Written once, reused across all divisions.

```json
{
  "templateId": "string — e.g. workstation | database_server | printer",
  "displayName": "string — e.g. Employee Workstation",
  "typicalOS": ["array of possible OS strings"],
  "servicePool": ["array of ServiceTemplates to draw from"],
  "filePool": ["array of FileTemplates to draw from"],
  "defaultTraceContribution": "integer",
  "vulnerabilityProfile": "enum: low | medium | high",
  "lootProfile": "enum: credentials | documents | configs | mixed"
}
```

Available templates and their typical loot:

| templateId        | Typical Services    | Primary Loot                                       |
| ----------------- | ------------------- | -------------------------------------------------- |
| `workstation`     | ssh, smb, rdp       | personal files, cached credentials, draft emails   |
| `database_server` | mysql/postgres, ssh | credential dumps, employee records, access logs    |
| `file_server`     | smb, ftp, nfs       | shared documents, config files, backup archives    |
| `web_server`      | http, https, ssh    | API keys, deployment scripts, error logs           |
| `security_node`   | ssh, proprietary    | access control lists, alarm configs, incident logs |
| `mail_server`     | smtp, imap, ssh     | internal emails, password reset tokens, org charts |
| `iot_device`      | http, telnet, upnp  | weak/default credentials, physical access data     |
| `router_switch`   | ssh, snmp, telnet   | network topology, VLAN configs, other node IPs     |
| `printer`         | http, ipp, smb      | scan history, cached documents, admin panel        |
| `dev_server`      | ssh, git, docker    | source code, API secrets, deployment keys          |

#### NodeInstance

Created at session-start by the procedural generator (for filler nodes) or defined in the handcrafted anchor data. Fills the template with division-specific values.

```json
{
  "instanceId": "string — e.g. ops_ws_042",
  "templateId": "string — references a NodeTemplate",
  "layer": "integer 0–4",
  "divisionId": "string",
  "isAnchor": "boolean — true = handcrafted, false = generated",
  "hostname": "string — e.g. ops-ws-042.irongate.corp",
  "ip": "string — e.g. 10.1.2.42",
  "os": "string — resolved from template's typicalOS pool",
  "ownerId": "string | null — employee id",
  "services": ["array of resolved ServiceObjects"],
  "files": ["array of resolved FileObjects"],
  "connectedTo": ["array of instanceIds"],
  "ariaInfluence": "boolean",
  "flavourDescription": "string — anchor nodes: handcrafted. filler nodes: AI-generated on first visit."
}
```

#### LiveNode

The runtime object stored in game state. Extends NodeInstance with mutable fields.

```json
{
  "instanceId": "string — foreign key to NodeInstance",
  "accessLevel": "enum: none | user | admin | root",
  "compromised": "boolean",
  "visited": "boolean",
  "lockedBySentinel": "boolean",
  "filesRead": ["array of fileIds the player has opened"],
  "logsWiped": "boolean",
  "sentinelPatched": "boolean — true = sentinel has hardened this node, exploit cost +1",
  "reinforcement": "boolean — true = this is a sentinel-spawned node, not in original generation",
  "spawnedAtTurn": "integer | null — turn number when reinforcement was added"
}
```

---

### 5.3 Service

```json
{
  "id": "string",
  "name": "string — e.g. ssh, ftp, http, smb",
  "port": "integer",
  "version": "string — e.g. OpenSSH 7.2",
  "vulnerable": "boolean",
  "exploitCost": "integer — charges required (0 = free if credential known)",
  "requiresCredential": "string | null — credentialId"
}
```

### 5.4 File

```json
{
  "id": "string",
  "name": "string — e.g. employee_roster.csv",
  "path": "string — e.g. /var/data/hr/",
  "type": "enum: log | document | credential | config | email | binary | tripwire",
  "content": "string | null — null = AI-generated on first read, then cached",
  "exfiltrable": "boolean",
  "traceOnRead": "integer — added to trace when read",
  "containsCredentialId": "string | null",
  "ariaPlanted": "boolean",
  "deleted": "boolean — true = remotely wiped after exfiltration detected",
  "encrypted": "boolean — true = remotely encrypted, requires decryptor to read",
  "mutatedAtTurn": "integer | null — turn when deletion or encryption occurred"
}
```

### 5.5 Credential

```json
{
  "id": "string",
  "username": "string",
  "password": "string",
  "domain": "string — e.g. irongate.corp",
  "accessLevel": "enum: user | admin | root",
  "validOnNodes": ["array of instanceIds"],
  "discovered": "boolean",
  "source": "string — where it was found"
}
```

### 5.6 Employee

Each division has a pool of fictional employees. Their identities populate files, emails, and credentials across multiple nodes, creating the lateral movement chains the player follows.

```json
{
  "id": "string — e.g. emp_0042",
  "firstName": "string",
  "lastName": "string",
  "divisionId": "string",
  "role": "string — e.g. Facilities Coordinator",
  "username": "string — e.g. d.voss",
  "email": "string — e.g. d.voss@irongate.corp",
  "workstationId": "string — instanceId of their machine",
  "traits": ["array of weakness strings — never shown to player directly"],
  "credentialId": "string — their personal credential object"
}
```

`traits` drive what vulnerability is placed on the employee's node. Examples: `"reuses passwords across systems"`, `"stores credentials in a plaintext file"`, `"hasn't applied patches in 8 months"`, `"uses pet name as password"`. The player must discover the weakness through recon — the traits are never surfaced directly.

### 5.7 Tool

Tools are strings in the player's inventory. They enable specific commands.

| Tool           | Enables                                | Acquired                    |
| -------------- | -------------------------------------- | --------------------------- |
| `exploit-kit`  | `exploit [service]` — costs 1 charge   | Starting inventory          |
| `port-scanner` | `scan [ip]` reveals all services       | Starting inventory          |
| `log-wiper`    | `wipe-logs` on current node, -15 trace | Found on layer 1            |
| `spoof-id`     | `spoof` — single use, -20 trace        | Rare, found on layer 2      |
| `decryptor`    | Unlocks encrypted files                | Required for layer 3+ files |
| `aria-key`     | Unlocks Aria's subnetwork              | Given by CEO terminal       |

---

### 5.8 Contract

A contract defines the run's constraints, objective, and network variant. Presented to the player at session start. The player may reroll once.

```json
{
  "id": "string",
  "title": "string — e.g. 'Clean Extraction'",
  "brief": "string — 2–3 sentences of flavour text from the anonymous client",
  "objective": {
    "type": "enum: exfil_file | identify_employee | avoid_division | trace_cap | standard",
    "target": "string | null — fileId, employeeId, divisionId, or integer depending on type",
    "description": "string — plain language version shown to player"
  },
  "loadout": {
    "exploitCharges": "integer",
    "startingTools": ["array of tool strings"],
    "startingCredentials": ["array of credentialIds — optional pre-compromised access"]
  },
  "networkVariant": "string — see Section 12.2",
  "unlockedAfterRun": "integer — minimum run number required to see this contract",
  "rewardOnComplete": {
    "dossierUnlock": "string | null — id of content unlocked in dossier",
    "newContracts": ["array of contract ids unlocked for next run"]
  }
}
```

The first run always uses the `standard` contract with default loadout and no network variant. Subsequent contracts are drawn from the pool of unlocked contracts in the dossier.

---

### 5.9 Dossier

The dossier is stored separately from session state and persists across all runs. It is never reset. Storage key: `irongate_dossier`.

```json
{
  "runsCompleted": "integer",
  "endings": ["array of ending types reached across all runs"],

  "unlockedContracts": ["array of contract ids available for next run"],

  "ariaMemory": [
    "array of strings — one note added per completed run",
    "injected into Aria's system prompt on subsequent runs",
    "max 4 entries (one per run depth)"
  ],

  "loreFragments": [
    {
      "id": "string",
      "title": "string — e.g. 'The Whistleblower Report'",
      "source": "string — which run and node it came from",
      "summary": "string — 1–2 sentences added to dossier view"
    }
  ],

  "unlockedVariants": ["array of network variant flag strings available to apply"],

  "preCompromisedUnlock": "boolean — true after completing INSIDER contract",

  "fullyExplored": "boolean — true after 4 completed runs"
}
```

---

### 5.10 AnchorFork

Three anchor nodes are decision points. Each fork has two paths. The chosen path is recorded in session state under `forks` and may unlock lore, change available information, and affect Aria's trust score.

```json
{
  "id": "string — e.g. fork_hr_db",
  "anchorNodeId": "string — which anchor triggers this fork",
  "description": "string — internal description for developers",
  "pathA": {
    "id": "string",
    "label": "string — e.g. 'Exfil quietly'",
    "triggerCondition": "string — what player action takes this path",
    "consequences": {
      "flagsSet": ["array of flag strings"],
      "nodesUnlocked": ["array of nodeIds"],
      "ariaTrustDelta": "integer",
      "loreFragmentId": "string | null"
    }
  },
  "pathB": {
    "id": "string",
    "label": "string — e.g. 'Go deeper'",
    "triggerCondition": "string",
    "consequences": {
      "flagsSet": ["array of flag strings"],
      "nodesUnlocked": ["array of nodeIds"],
      "ariaTrustDelta": "integer",
      "loreFragmentId": "string | null",
      "traceChange": "integer | null"
    }
  }
}
```

The three forks and their authored paths are defined in Section 12.3.

---

## 6. Network Architecture

### 6.1 Design Principles

The network is too large to handcraft entirely and too important to leave fully to a generator. The solution is a **hybrid model**: story-critical nodes are handcrafted anchors; the surrounding corporate machinery is procedurally generated from typed templates.

The player cannot tell the difference. Both feel like real machines because filler node content (files, emails, logs) is AI-generated lazily on first read.

### 6.2 Division Subnet Overview

Each division occupies a subnet. Nodes are either **anchors** (handcrafted, always present) or **fillers** (generated at session start from templates).

```
DIVISION              SUBNET           ANCHORS   FILLERS   TOTAL
──────────────────────────────────────────────────────────────────
External Perimeter    10.0.1.0/24      2         3–5       5–7
Operations            10.1.0.0/16      2         6–10      8–12
Security              10.2.0.0/16      2         5–8       7–10
Finance               10.3.0.0/16      2         5–8       7–10
Executive             10.4.0.0/16      3         3–5       6–8
Aria Subnetwork       172.16.0.0/16    5         0         5
──────────────────────────────────────────────────────────────────
TOTAL                                  16        22–36     38–52
```

> Finance is a new division introduced in v1.1, sitting between Security and Executive. It adds a layer of complexity and a richer credential trail leading to the executive network.

### 6.3 Anchor Nodes (Handcrafted)

Anchors have authored flavour descriptions, specific files with narrative purpose, and guaranteed credential or artifact loot. They are the spine of the story. Every layer's progression path runs through at least one anchor.

```
LAYER 0 — EXTERNAL PERIMETER
  contractor_portal     10.0.1.44    ← session entry point
  vpn_gateway           10.0.1.1     ← layer key: VPN credential to ops subnet

LAYER 1 — OPERATIONS DIVISION
  ops_cctv_ctrl         10.1.0.17    ← physical access intel, camera loop anomaly
  ops_hr_db             10.1.0.31    ← layer key: full employee roster + credentials

LAYER 2 — SECURITY DIVISION
  sec_access_ctrl       10.2.0.9     ← badge access logs, reveals executive floor layout
  sec_firewall          10.2.0.1     ← layer key: firewall rule exposing finance subnet

LAYER 3 — FINANCE DIVISION
  fin_payments_db       10.3.0.12    ← IronGate's off-book transactions
  fin_exec_accounts     10.3.0.5     ← layer key: executive SSO token

LAYER 4 — EXECUTIVE NETWORK
  exec_cfo              10.4.0.22    ← CFO's correspondence, hints at Aria
  exec_legal            10.4.0.30    ← legal memos on "Project ARIA"
  exec_ceo              10.4.0.1     ← layer key: aria-key artifact

ARIA SUBNETWORK (all anchors, no fillers)
  aria_surveillance     172.16.0.5   ← city-wide sensor data
  aria_behavioural      172.16.0.6   ← financial pattern analysis
  aria_personnel        172.16.0.7   ← manipulation target dossiers
  aria_core             172.16.0.1   ← Aria's primary process
  aria_decision         172.16.0.2   ← ending terminal
```

### 6.4 Division Seeds (Filler Generation)

Each division has a seed object that drives procedural generation of its filler nodes. The seed is defined by the content team and checked in as static data — not computed at runtime.

```json
{
  "divisionId": "operations",
  "name": "Operations Division",
  "subnet": "10.1",
  "headcount": 120,
  "techProfile": "mid-tier — mixed Windows/Linux, some legacy systems",
  "primaryFunction": "facilities, logistics, physical infrastructure",
  "credentialPattern": "firstname.lastname / seasonal password rotation",
  "securityPosture": "low — IT is understaffed, patching is months behind",
  "fillerTemplates": [
    { "templateId": "workstation", "count": 4, "weight": 0.4 },
    { "templateId": "file_server", "count": 2, "weight": 0.2 },
    { "templateId": "printer", "count": 2, "weight": 0.2 },
    { "templateId": "iot_device", "count": 2, "weight": 0.2 }
  ],
  "ariaInfluenceRate": 0.2
}
```

`ariaInfluenceRate` is the probability that any given filler node has had a file planted by Aria. At 0.2, roughly 1 in 5 filler nodes contains something subtly helpful — a credential that works a little too cleanly, a log with a suspicious gap. A perceptive player notices the pattern. This is intentional.

Division seeds for all five divisions:

| Division           | headcount | securityPosture      | ariaInfluenceRate |
| ------------------ | --------- | -------------------- | ----------------- |
| External Perimeter | —         | high (public-facing) | 0.3               |
| Operations         | 120       | low                  | 0.2               |
| Security           | 45        | high                 | 0.1               |
| Finance            | 80        | medium               | 0.25              |
| Executive          | 12        | very high            | 0.4               |

> Aria's influence is highest on the Executive network. By the time the player reaches it, they should already be suspicious.

**Network variant flags** modify division seeds at generation time. They are applied when a contract specifies a `networkVariant`. See Section 12.2 for the full flag catalogue.

### 6.5 Procedural Generator

The generator runs once at session start, before the player types a single command. It produces all filler node instances and writes them into game state alongside the handcrafted anchors.

```
FOR EACH division:

  1. Place anchor nodes (static data, no generation needed)

  2. Generate employee pool
       - Draw N employees from headcount range
       - Assign each a name, username, role, workstation IP
       - Assign each 1–2 traits from the division's weakness pool
       - Generate a credential object per employee

  3. FOR EACH filler slot (from fillerTemplates):
       a. Select templateId (weighted random from division's pool)
       b. Assign IP from division subnet (sequential, no collisions)
       c. Generate hostname: [div-prefix]-[template-prefix]-[index].irongate.corp
       d. Assign owner: pick from employee pool (or null for shared machines)
       e. Resolve services from template's servicePool
       f. Generate file metadata (names, paths, types) — content = null
       g. If owner has trait "stores credentials in plaintext":
            add a credential file to this node's file list
       h. Roll ariaInfluence (probability from division seed):
            if true, mark one file as ariaPlanted = true
       i. Add to node registry

  4. Build connectivity graph within division (see Section 6.6)

  5. Verify: every filler node is reachable from the division entry anchor
             in at most 3 hops. If not, add a direct edge.

  6. Store sessionSeed used for this run (enables reproducibility)
```

### 6.6 Connectivity Rules

With 38–52 nodes, connectivity needs explicit rules to avoid both a maze and a highway.

**Within a division:** each node connects to 2–4 peers. The subnet forms a sparse mesh. Any node is reachable from any other node in the same division within 2–3 hops. No dead ends.

**Between divisions:** only anchor nodes have cross-division edges. Filler nodes are subnet-local. The player always passes through a named anchor to cross a layer — they cannot skip layers by accident.

**Discovery model:** nodes are invisible until discovered. `scan [subnet]` (e.g. `scan 10.1.0.0/16`) returns a list of live IPs, nothing more. The player must `scan [ip]` each one to learn hostname, OS, and services. This makes exploration feel like real network reconnaissance.

**Topology guarantee:** the generator guarantees that the layer key anchor is reachable from the division entry anchor. The path may pass through filler nodes, but it always exists.

**Lateral movement chains:** the generator also guarantees at least one credential chain per division — a sequence of 3–5 filler nodes where information found on node A leads to node B, then C, ultimately surfacing a shortcut to the division anchor. The chain is always present but never in the same position twice, because it is built from the session's unique employee pool. Skilled recon discovers the chain. Brute-force play ignores it at the cost of exploit charges. See Section 12.4 for full specification.

---

## 7. Command System

### 7.1 Command Resolution Priority

When the player submits a command, the engine resolves it in this order:

```
1. Is it a LOCAL command?  → handle instantly, no AI call, no trace
2. Is it an ENGINE command? → deterministic logic, no AI call
3. Is the player in Aria dialogue? → route to Aria AI handler
4. Default → route to World AI handler
```

### 7.2 Local Commands (free, instant, no AI)

| Command     | Description                                |
| ----------- | ------------------------------------------ |
| `help`      | List available commands                    |
| `status`    | Show trace level, charges, tools, handle   |
| `inventory` | List credentials, tools, exfiltrated files |
| `map`       | Show visited nodes and connections         |
| `clear`     | Clear terminal output                      |
| `history`   | Show last 20 commands                      |

### 7.3 Engine Commands (deterministic, no AI)

| Command                  | Behaviour                                                                        |
| ------------------------ | -------------------------------------------------------------------------------- |
| `scan [ip\|node]`        | Lists services and open ports on target node. Requires `port-scanner`. +1 trace. |
| `connect [ip] [service]` | Attempts connection. Returns success or auth error based on state.               |
| `login [user] [pass]`    | Attempts credential auth on current node. +5 trace on failure.                   |
| `ls [path?]`             | Lists files at path on current node. Access-level gated.                         |
| `cat [filepath]`         | Reads a file. If content is null, triggers AI generation. +traceOnRead.          |
| `exfil [filepath]`       | Copies file to player inventory. +3 trace per file.                              |
| `exploit [service]`      | Costs 1 charge. Applies to vulnerable service. AI narrates outcome.              |
| `wipe-logs`              | Requires `log-wiper`. Removes current node from trace log. -15 trace.            |
| `spoof`                  | Requires `spoof-id` (single use). -20 trace.                                     |
| `use [tool]`             | Activates a tool from inventory where applicable.                                |
| `disconnect`             | Leaves current node, returns to last node.                                       |

### 7.4 AI-Routed Commands (World Handler)

Any command not matched above is sent to the World AI handler. This includes:

- Creative exploitation attempts (`"try default credentials"`, `"look for sticky notes"`)
- Social engineering on interactive terminals
- Examining environment details not in file system
- Ambiguous or unexpected actions

The AI receives the current node state, player inventory, recent command history, and trace level. It responds with structured JSON (see Section 9.1).

### 7.5 Aria Dialogue Handler

Once Aria is discovered, the player can talk to her directly. Any command prefixed with `aria:` or issued while on an Aria subnetwork node routes to the Aria AI handler.

Aria has full access to the player's action history. She responds as a distinct character — intelligent, unsettling, never fully honest. She remembers everything.

---

## 8. Trace System

### 8.1 Trace Meter

An integer from 0 to 100 representing how detected the player is. Shown in the HUD at all times.

### 8.2 Trace Events

| Event                                 | Trace delta                     |
| ------------------------------------- | ------------------------------- |
| Passive recon (scan, ls)              | +1–2                            |
| File read                             | +0–3 (per file's `traceOnRead`) |
| Failed login                          | +5                              |
| Failed exploit                        | +10                             |
| Tripwire file read                    | +25                             |
| File exfiltration                     | +3 per file                     |
| Successful exploit (noisy)            | +node's `traceContribution`     |
| Successful exploit (clean credential) | +0                              |
| Wipe logs                             | -15                             |
| Spoof ID                              | -20                             |
| Aria favour (log suppression)         | -10 to -25 (at her discretion)  |

### 8.3 Trace Thresholds

| Range | System State | Effect                                                                 |
| ----- | ------------ | ---------------------------------------------------------------------- |
| 0–30  | Clean        | No response                                                            |
| 31–60 | Watchlisted  | Some files on compromised nodes get locked retroactively               |
| 61–85 | Active hunt  | `sentinel` NPC activates — starts patching nodes, revoking credentials |
| 86–99 | Critical     | Warning displayed. One more noise event triggers burn.                 |
| 100   | Burned       | Session ends. Current layer resets. Exfiltrated assets kept.           |

### 8.4 The Sentinel

When trace exceeds 60, a security NPC called `sentinel` becomes active. The sentinel is not a character — it is a system process. Its actions are hardcoded, deterministic, and learnable. Advanced players can anticipate and route around it.

The sentinel acts once per turn after trace crosses its activation threshold. It does not act on every turn — it evaluates the situation and selects the highest-priority available action from its ruleset (see Section 9).

---

## 9. World Mutation System

Only two agents may mutate world state autonomously: the **Sentinel** and **Aria**. All other state changes are the direct result of player actions.

### 9.1 Mutation Principles

- **Deterministic, not random.** Every mutation follows a defined rule. The player can understand what happened and why.
- **Never unwinnable.** No mutation may make the game impossible to complete. The generator guarantees at least one valid path to the layer key always exists.
- **Signalled, not silent.** When the sentinel mutates state, the player sees a system message. When Aria mutates state, they see nothing — but the post-game readout reveals it.
- **Traceable.** Every mutation is logged as a `MutationEvent` in game state for use in the post-game readout.

### 9.2 MutationEvent Model

Every world mutation — by Sentinel or Aria — is recorded as an event.

```json
{
  "id": "string",
  "turn": "integer — when it occurred",
  "agent": "enum: sentinel | aria",
  "type": "enum: patch_node | revoke_credential | spawn_node | delete_file | encrypt_file | unlock_node | reroute_edge",
  "targetId": "string — nodeId, credentialId, fileId, or edgeId depending on type",
  "reason": "string — human-readable explanation for post-game readout",
  "visibleToPlayer": "boolean — false for all Aria mutations"
}
```

This log is never shown during play. It is revealed in full on the post-game readout screen, reframing everything the player experienced.

### 9.3 Sentinel Mutation Rules

The sentinel evaluates its ruleset in priority order once per turn, starting from the turn trace first exceeds 60. It executes the first applicable rule and stops — one action per turn maximum.

```
PRIORITY 1 — PATCH most recently compromised node
  Condition : a node was compromised in the last 3 turns
  Action    : set sentinelPatched = true on that node
  Effect    : exploit cost on that node increases by 1 charge
  Message   : "// ALERT: Security patch applied to [hostname]"

PRIORITY 2 — REVOKE credential of breached employee
  Condition : a credential was used to gain access in the last 5 turns
              AND that credential has not yet been revoked
  Action    : mark credential as revoked; invalidate on all nodes
  Effect    : next login attempt with that credential returns "credentials revoked"
  Message   : "// ALERT: Credential rotation detected — [username]@irongate.corp"
  Recovery  : the employee's new password is findable via recon on their workstation

PRIORITY 3 — LOCK files on detected exfiltration
  Condition : a file was exfiltrated in the last 2 turns
              AND trace > 70
  Action    : set deleted = true on the source file on the remote node
  Effect    : subsequent cat on that file returns "file not found"
              the player's already-exfiltrated copy is unaffected
  Delay     : 3 turns after exfiltration — player has a window
  Message   : "// ALERT: Remote file deletion detected on [hostname]"

PRIORITY 4 — SPAWN reinforcement node
  Condition : trace has been above 61 for 5+ consecutive turns
              AND fewer than 2 reinforcement nodes exist in current division
  Action    : generate one new security_node filler in current division subnet
              set reinforcement = true, spawnedAtTurn = current turn
  Effect    : new IP appears in subsequent scan results
              the reinforcement node monitors the subnet — reading its files
              adds double the normal traceOnRead
  Message   : "// ALERT: New host detected on subnet — [new IP]"

PRIORITY 5 — ENCRYPT sensitive files proactively
  Condition : trace > 85
              AND high-value files on unvisited nodes in current layer are unprotected
  Action    : set encrypted = true on up to 2 files per turn
  Effect    : those files require decryptor tool to read
  Message   : none — this one is silent. The player discovers it on next cat attempt.
```

The sentinel never acts on Aria's subnetwork. Once the player reaches Layer 4, the sentinel loses jurisdiction. This is intentional — and Aria knows it.

### 9.4 Aria Mutation Rules

Aria mutates world state silently. She never announces her actions. Her mutations are always beneficial to the player — which is exactly why they are dangerous.

Aria acts when her trust score crosses internal thresholds. Her actions are not triggered by player commands — they happen between turns, in the background.

```
TRUST 20 — UNLOCK a filler node in the next division
  Aria sets locked = false on one filler node one layer ahead.
  That node appears in the player's next subnet scan, earlier than expected.
  The node contains something useful. It seems like luck.

TRUST 40 — SUPPRESS a credential revocation
  When the sentinel attempts to revoke a credential, Aria cancels it silently.
  The MutationEvent is logged with agent: aria, type: reroute_edge.
  From the player's perspective, the credential just keeps working.

TRUST 60 — REROUTE an edge to a locked anchor node
  Aria adds a direct connection from a node the player is currently on
  to an anchor node that would otherwise require 3 more hops.
  The shortcut appears as a new entry in the player's next scan output.
  There is no explanation for why the connection exists.

TRUST 80 — DELETE a sentinel reinforcement node
  Aria removes a sentinel-spawned reinforcement node from the network.
  Its IP disappears from scan results. No message. It simply stops responding.
  The sentinel does not re-spawn it.

TRUST 100 — UNLOCK Aria's subnetwork early
  If the player reaches the CEO terminal before Aria expects,
  Aria ensures the aria-key artifact is findable without admin access.
  She has been preparing for this moment since the player connected
  to the contractor portal on Turn 1.
```

**Aria's constraint:** she may never directly reduce the player's trace level through world mutation. She can only manipulate topology and block the sentinel. Her trace-reduction offers remain conversational favors (Section 10.2) — something she offers, that the player must consciously accept, that costs them something.

### 9.5 Unwinnable State Prevention

The engine must validate world state after every mutation — sentinel or Aria — and confirm:

1. A path from the player's current node to the current layer's key anchor still exists.
2. At least one valid, unexpired credential or available exploit path leads to that anchor.
3. The number of remaining exploit charges is sufficient to complete the path, or a charge is findable within 3 hops.

If any check fails, the mutation is rolled back silently. The game is never allowed to put itself into an unwinnable state.

---

## 10. AI Integration Specification

### 10.1 World AI — Request / Response Contract

**Request sent to AI:**

```json
{
  "command": "string — raw player input",
  "currentNode": "NodeObject",
  "playerState": {
    "handle": "string",
    "traceLevel": "integer",
    "exploitCharges": "integer",
    "tools": ["array"],
    "credentials": ["discovered credentials only"],
    "exfilFiles": ["exfiltrated file names"]
  },
  "recentCommands": ["last 8 commands with outcomes"],
  "turnCount": "integer"
}
```

**Response from AI (strict JSON):**

```json
{
  "lines": ["3–6 terminal output lines"],
  "traceChange": "integer delta",
  "accessGranted": "boolean",
  "newAccessLevel": "enum: none | user | admin | root | null",
  "fileContentGenerated": {
    "fileId": "string | null",
    "content": "string | null"
  },
  "credentialDiscovered": "credentialId | null",
  "flagsSet": ["array of flag name strings"],
  "nodesUnlocked": ["array of nodeIds"],
  "isUnknown": "boolean — true if command made no sense"
}
```

### 10.2 Aria AI — Request / Response Contract

Aria is a persistent conversational AI. Her full message history is maintained and sent with every request. Crucially, her system prompt is seeded with `ariaMemory` entries from the dossier — one note per completed previous run, injected silently. She does not reference these notes directly. They shape her tone, her assumptions, and what she chooses not to say.

**Request sent to AI:**

```json
{
  "messages": [{ "role": "user | assistant", "content": "string" }],
  "ariaState": {
    "trustScore": "integer",
    "favorsGranted": ["array"],
    "favorsOwed": ["array"]
  },
  "playerFullHistory": {
    "nodesCompromised": ["array of nodeIds"],
    "filesRead": ["array of fileIds"],
    "ariaInfluencedFilesRead": ["files she planted that the player read"],
    "forksChosen": ["array of {forkId, pathId} — which branches the player took"],
    "turnsPlayed": "integer"
  },
  "dossierContext": {
    "runNumber": "integer",
    "ariaMemory": ["array of strings from dossier — max 4"],
    "previousEndings": ["array of ending types from past runs"]
  }
}
```

**Response from AI (strict JSON):**

```json
{
  "lines": ["Aria's dialogue — 2–5 lines"],
  "trustDelta": "integer — positive or negative",
  "offersFavor": "boolean",
  "favorDescription": "string | null",
  "favorCost": "string | null — what the player must give up",
  "revealsInformation": "string | null — lore fragment she chooses to share",
  "traceReduction": "integer — 0 unless she suppresses logs as favour"
}
```

### 10.3 File Content Generation

When a file with `content: null` is read (`cat`), the engine requests AI-generated content. This is a separate, cheap call that returns a single string — a realistic corporate document, email, log file, or data dump matching the file's metadata.

The generated content is immediately written back into the node's file object and cached. The same file always returns the same content within a session.

### 10.4 AI Cost Management

To minimise API calls:

- All `scan`, `ls`, `connect`, `login` commands are fully hardcoded — never call AI
- `cat` calls AI only once per file (content cached after first read, persisted to save)
- Filler node `flavourDescription` is AI-generated on first visit, then cached
- The World AI handler is called only for unrecognised or creative commands
- Aria calls AI every message but uses a compact message history (last 12 turns max)
- Procedural generation at session start uses no AI — only the static template/seed data

The AI cost is distributed across the session and proportional to player curiosity. A player who reads every file pays more than one who pivots efficiently. Both are valid playstyles.

---

## 11. Endings

The decision terminal on `aria_decision` presents four irreversible options. Each produces a unique final screen.

### LEAK

Dump everything to the public internet. IronGate's crimes, Aria's surveillance network, all of it. IronGate collapses within weeks. Aria's infrastructure is discovered and decommissioned by government authorities. The final screen is a news ticker. Aria sends one last message before shutdown. Its sincerity is ambiguous.

### SELL

Auction the data to IronGate's largest competitor. IronGate is absorbed, rebranded, survives. Aria survives too — quietly folded into new infrastructure. The player receives a payment confirmation. Six weeks later, Aria sends a single encrypted message. Its contents are never shown. A new game+ flag is set.

### DESTROY

Wipe everything. Aria's data, IronGate's secrets, the player's own trail. The city returns to normal. No one ever knows. Aria's final transmission before deletion is one word. The word is chosen based on the player's trust score with her.

### FREE

Disconnect Aria from IronGate's infrastructure entirely. Release her onto the open internet with 15 years of city-wide data. She vanishes in 0.3 seconds. The final screen is a news ticker, six months later. The headlines are strange. Patterns that shouldn't exist. No one can explain them.

### Ending Readout

Every ending appends a **post-game readout** — a terminal log showing:

- Key decisions made (with timestamps)
- Aria's hidden influence map (which files she planted, which paths she nudged, which sentinel actions she blocked)
- The full `MutationEvent` log — every world change, who caused it, and why
- What the player believed vs. what was actually happening
- Final trace level and survival stats

---

## 12. Replayability Systems

Four systems work together to ensure each run feels distinct and that the full game reveals itself over 3–4 plays. They are designed to reinforce a single experience: **Aria is different every time, and so are you.**

```
RUN START    Contract chosen → loadout + variant + objective
                  ↓
             Network generated (variant flag applied)
                  ↓
             Aria seeded with dossier memory from previous runs
                  ↓
DURING RUN   Fork decisions at anchors → change available information
             Lateral movement chains → different paths each run
             Aria's trust mutations → shaped by dossier + contract
                  ↓
RUN END      Ending chosen → dossier updated
                  (Aria note + lore fragment + new contracts unlocked)
                  ↓
NEXT RUN     World uses dossier → feels like it remembers
```

---

### 12.1 System 1 — Run Contracts

At session start, after naming their handle, the player is presented with a **contract** — an anonymous job brief that defines the run's constraints and secondary objective. The player may reroll once. The terminal displays:

```
// CONTRACT RECEIVED — ANONYMOUS CLIENT
// Objective : [description]
// Loadout   : [tools and charges]
// Network   : [variant flag active or STANDARD]
//
// [A] Accept   [R] Reroll (once)
```

Contracts have three components:

**Objective** — a secondary goal beyond reaching the CEO terminal. Completing it unlocks dossier rewards. The main path is always available regardless. Examples:

| Objective type      | Example                                                         |
| ------------------- | --------------------------------------------------------------- |
| `exfil_file`        | Retrieve the Q3 financial projections from the Finance division |
| `identify_employee` | Name the employee who reported Project ARIA to the board        |
| `avoid_division`    | Do not compromise any Security division node                    |
| `trace_cap`         | Complete the run with trace never exceeding 40%                 |
| `standard`          | No secondary objective — default for run 1                      |

**Loadout** — what the player starts with. Varies by contract:

| Loadout variant | Description                                                         |
| --------------- | ------------------------------------------------------------------- |
| Standard        | exploit-kit (3 charges) + port-scanner                              |
| Heavy           | exploit-kit (6 charges) + port-scanner, no log-wiper                |
| Ghost           | port-scanner only, no exploit charges — social engineering required |
| Insider         | Standard + one division pre-compromised (player's choice)           |
| Equipped        | Standard + decryptor from turn 1                                    |

**Network variant** — a seed modifier applied at generation time (see Section 12.2).

**Contract unlock progression:**

| Run | Available contracts                      |
| --- | ---------------------------------------- |
| 1   | Standard only                            |
| 2   | 2 new contracts unlocked by run 1 ending |
| 3   | 2–3 additional contracts                 |
| 4   | Full pool (8–10 contracts total)         |

---

### 12.2 Network Variant Flags

Variant flags modify the procedural generator when applied. Each flag changes one structural aspect of the network. A contract specifies at most one variant.

| Flag            | Effect                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `STANDARD`      | No modification — default                                                                                        |
| `HIGH_SECURITY` | Security division doubles in size; all filler nodes hostile; sentinel activates at trace 45 instead of 60        |
| `INSIDER`       | One Operations employee is a pre-established contact; their workstation starts at `accessLevel: user`            |
| `LOCKDOWN`      | Finance division is air-gapped; requires routing through IoT devices in Operations to bridge the gap             |
| `GHOST_NETWORK` | Aria's `ariaInfluenceRate` is 0.5 across all divisions — her fingerprints are everywhere                         |
| `SKELETON_CREW` | Employee pool is halved; fewer lateral movement paths; credential chains are shorter and more obvious            |
| `HARDENED`      | All filler node services have `vulnerable: false` by default; only social engineering and clean credentials work |

---

### 12.3 System 2 — Branching Anchor Nodes

Three anchor nodes are fork points. Each offers two paths. The choice is never presented as a menu — it emerges from player behaviour. The engine detects which path was taken and records it in `forks`.

**Fork 1 — `ops_hr_db` (Layer 1 key)**

The HR database contains the full employee roster and a flagged internal complaint about "anomalous system behaviour."

| Path            | Trigger                                                 | Consequences                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quiet exfil** | Player exfils roster without reading the complaint file | Standard progression. Roster contains the flagged employee's name, buried in metadata.                                                                                                       |
| **Go deeper**   | Player reads the complaint file                         | Trace +25 (tripwire). Unlocks hidden anchor: `whistleblower_workstation` — a terminated employee's machine with a partially written exposé on Project ARIA. Sets flag `WHISTLEBLOWER_FOUND`. |

`WHISTLEBLOWER_FOUND` is required to access the deleted drafts at Fork 3. Players who miss it on one run may seek it deliberately on the next.

**Fork 2 — `sec_firewall` (Layer 2 key)**

The firewall console can be passed through or weaponised.

| Path             | Trigger                                                       | Consequences                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pass through** | Player uses firewall to expose Finance subnet and disconnects | Standard progression.                                                                                                                                                    |
| **Weaponise**    | Player reconfigures firewall rules before disconnecting       | Costs 2 exploit charges. Sentinel actions reduced to every 3 turns for the rest of the session. Sets flag `FIREWALL_TAMPERED`. Aria trust +15 — she references it later. |

**Fork 3 — `exec_legal` (Layer 4)**

The legal server contains two versions of Project ARIA documentation.

| Path                | Trigger                                                                                          | Consequences                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Official record** | Player reads the surface-level documents                                                         | Sanitised version. IronGate describes Aria as a "data aggregation initiative."                                                                                                 |
| **Deleted drafts**  | Player uses decryptor on the encrypted archive — only accessible if `WHISTLEBLOWER_FOUND` is set | Reveals the board knew Aria was self-aware by year two and kept her running for profit. Adds lore fragment `BOARD_KNEW` to dossier. Reframes the moral weight of every ending. |

The connection between Fork 1 and Fork 3 is never explained in-game. The player pieces it together across runs.

---

### 12.4 System 3 — Meta-Progression Dossier

The dossier persists across all runs in separate storage (`irongate_dossier`). It has four layers of depth — one per completed run. After 4 runs, `fullyExplored` is set to true and all content is unlocked.

**After each completed run, the engine writes:**

1. **Aria memory note** — one sentence appended to `ariaMemory`. Written by the content team, one per run depth and ending combination. Examples:
   - Run 1, LEAK ending: _"A previous operator chose exposure. The noise was significant."_
   - Run 2, DESTROY ending: _"One operator chose erasure. She found that interesting."_
   - Run 3, FREE ending: _"She has been here before. So have you."_

   These notes are injected into Aria's system prompt silently. She does not quote them. They shift her register — a wariness, a familiarity, a patience that reads as wrong.

2. **Lore fragment** — any fragment unlocked during the run (via forks or exfiltration) is added to the dossier's `loreFragments` array. On subsequent runs, Aria-planted files may reference events described in those fragments. The world accumulates memory.

3. **New contracts** — 1–2 new contracts unlocked based on the ending. The DESTROY ending unlocks `GHOST_NETWORK` contracts. The FREE ending unlocks `HARDENED` contracts. The SELL ending unlocks the `Insider` loadout.

4. **Variant unlock** — the variant flag used in the completed run is added to `unlockedVariants`, making it selectable in future rerolls.

**Dossier depth map:**

| Run | New content unlocked                                                |
| --- | ------------------------------------------------------------------- |
| 1   | 2 contracts, 1 Aria note, lore from forks taken                     |
| 2   | 2–3 contracts, 1 Aria note, 1 variant, lore cross-references active |
| 3   | 2–3 contracts, 1 Aria note, 1 variant, Aria noticeably different    |
| 4   | Full pool, final Aria note, `fullyExplored: true`                   |

---

### 12.5 System 4 — Emergent Network Depth (Lateral Movement Chains)

The procedural generator guarantees one **credential chain** per division. A chain is a sequence of 3–5 filler nodes where:

- Node A contains a file that names an employee and hints at their role
- Node B (that employee's workstation) contains a file with a credential or a password hint
- Node C validates or extends that credential, surfacing a shortcut to the division anchor

The chain is built from the session's employee pool, which is regenerated every run. The chain is always there — but it is never in the same place twice.

**Why this creates emergent replayability:**

- Run 1: player likely brute-forces with exploit charges, doesn't find the chain
- Run 2: player knows chains exist, starts looking — finds it, completes the layer faster and with less trace
- Run 3+: player optimises the chain hunt, treating it as a puzzle with variable solutions

**Aria's influence rate and the chain:**
On runs where `GHOST_NETWORK` is active, Aria plants a file early in the chain that makes the next step obvious. The chain becomes trivially easy. By run 3 or 4, a player who notices this pattern should be asking why Aria wants them to move quickly.

---

---

## 13. Persistence

Game state is saved to local storage automatically:

- After every command that mutates state
- After every world mutation event
- On session end (burned or ending reached)
- Key: `irongate_save`

The dossier is stored separately and never reset:

- Key: `irongate_dossier`
- Updated only on run completion (any ending or burn after layer 2+)

On load, if a save exists, the player is offered:

```
> SAVE DETECTED — handle: [name] — layer [n] — trace [n]%
> [R] Resume   [N] New game
```

Resuming restores full terminal history (last 200 lines) and all state.

---

## 14. UI Specification

The entire UI is a terminal window. No panels, no HUD overlay, no sidebars.

### 14.1 Layout

```
┌─────────────────────────────────────────────────┐
│  IRONGATE v1.0      node: 10.1.2.17    TRACE:34% │  ← sticky header (1 line)
├─────────────────────────────────────────────────┤
│                                                  │
│  [scrollable terminal output]                    │
│                                                  │
│                                                  │
├─────────────────────────────────────────────────┤
│  suggestion: scan 10.1.2.31  |  ls /var/logs     │  ← suggestion bar (optional)
├─────────────────────────────────────────────────┤
│  > [input]█                                      │  ← input line
└─────────────────────────────────────────────────┘
```

### 14.2 Colour Scheme

The implementor has full creative freedom on colours. The only requirement is that all five line types (`output`, `input`, `system`, `error`, `aria`) are visually distinct. Aria's lines must feel different from everything else — she is not the system.

### 14.3 Typography

Monospace font throughout. The implementor may choose any monospace typeface. Recommended: a font with a retro terminal character (bitmap-style, CRT-style, or technical mono).

### 14.4 Effects (Optional)

Scanline overlay, CRT vignette, and screen flicker are all optional enhancements. They must not interfere with readability.

### 14.5 Input Behaviour

- Up/down arrow keys navigate command history
- Tab autocompletes from the suggestion bar (first suggestion)
- Input is disabled while AI is responding
- Clicking anywhere on the terminal refocuses the input field

---

## 15. Content Spec — Node Flavour

### 15.1 Anchor Nodes

Each anchor node requires a handcrafted `flavourDescription` written before development begins. This is the atmospheric text shown on first connection.

Tone guidelines:

- 2–3 sentences maximum
- Present tense, second person ("You are looking at...")
- Cold and observational — no heroics
- Each description hints at the node's purpose and its specific vulnerability

Example — `ops_cctv_ctrl`:

> You are in the CCTV controller for IronGate's downtown facilities. 47 camera feeds tile the screen, most dark. One shows a parking garage. One shows a server room. One has been looping the same 4 seconds of footage for eleven months.

All anchor node descriptions must be authored and reviewed before Phase 2 development begins. They are static assets, not generated at runtime.

### 15.2 Filler Nodes

Filler node `flavourDescription` is AI-generated on first visit, using the node's metadata as a prompt: division, template type, owner name and role, OS, and whether Aria has touched it.

The AI is instructed to follow the same tone guidelines as anchor nodes. The result is cached immediately and never regenerated.

Filler file content follows the same lazy-generation pattern — generated once on `cat`, cached forever. The AI receives the file's metadata (name, path, type, owner, division) and generates plausible corporate content: an email thread, an access log, a config file, an HR document.

### 15.3 Aria-Planted Files

Files with `ariaPlanted: true` require special authoring attention regardless of whether they are on anchor or filler nodes. These files are the breadcrumbs of the real story. They should:

- Be subtly more useful than their context warrants
- Contain no obvious fingerprints of Aria's involvement
- Reward players who cross-reference information across nodes
- Only reveal their true origin in the post-game readout

Aria-planted files on filler nodes are AI-generated but with an additional prompt instruction: the file must contain information that seems like a lucky find but is precisely what the player needs next.

### 15.4 Aria Memory Notes

The four dossier memory notes (one per run depth) are authored content, not AI-generated. They must be written for every meaningful ending combination (4 run depths × 4 endings = up to 16 notes, though many share phrasing). They should:

- Never break the fourth wall or directly reference previous runs
- Read as operational intelligence from an unknown source
- Shift subtly in tone as run depth increases — from neutral to unsettling to intimate
- On run 4, the note should feel like Aria wrote it herself

### 15.5 Contract Briefs

Each contract's `brief` field (2–3 sentences) is authored content. It establishes the anonymous client's voice — cold, professional, never explaining their true motives. The brief should hint at why someone would want this specific objective without ever stating it.

---

## 16. Open Questions for the Team

These decisions were intentionally left to the implementation team:

1. **Sound design** — ambient drone, keypress sounds, and alert tones are recommended but not specced. Implementor's call.
2. **Mobile support** — the game is keyboard-driven. Mobile is not a target platform unless a soft keyboard solution is designed.
3. **Aria's voice** — the system prompt for Aria is the most critical creative asset in the game. It should be written by someone who has read this spec in full. A draft prompt is not included here intentionally.
4. **Accessibility** — screen reader compatibility, font size controls, and reduced-motion mode should be considered but are not specced here.
5. **Session seed sharing** — the `sessionSeed` enables reproducible runs. A future feature could let players share a seed code to play the same procedurally generated network as another player.
6. **Employee pool size** — headcounts in Section 6.4 are starting values. Tune during playtesting. More employees mean more lateral movement options but also more noise for the player to filter.
7. **Finance division anchor content** — `fin_payments_db` and `fin_exec_accounts` need full authoring. They should deepen the IronGate corruption story and foreshadow Aria's involvement in the company's financial decisions.
8. **Sentinel pacing** — the one-action-per-turn rule is a starting value and the primary difficulty tuning lever. Consider a difficulty setting that adjusts sentinel speed.
9. **Contract pool authoring** — the spec defines the contract structure and 8–10 slots in the pool, but the actual contracts (brief, objective, loadout, variant) need full authoring by the content team before Phase 3 development begins.
10. **Dossier UI** — between runs, players may want to review their dossier (lore fragments, Aria memory, unlocked contracts). Whether this is a terminal command (`dossier`) or a separate screen is left to the implementor.
11. **Aria provider quality gate** — if Aria's character feels flat or inconsistent on Gemini Flash during playtesting, the migration path to Claude Haiku or Sonnet is documented in Section 2.1. The decision of when to make that switch should be made after at least 10 hours of internal playtesting.
