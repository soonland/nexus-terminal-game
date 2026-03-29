# NEXUS — Terminal Infiltration Game

A browser-based terminal hacking game with a sci-fi noir aesthetic. You are a Nexus Corp field operative tasked with infiltrating the corporate network of IronGate Corp — pivoting node by node toward the executive subnet, where something unexpected is waiting.

Inspired by _Mr. Robot_, _Neuromancer_, and the classic feel of TN3270/DOS terminals.

---

## Gameplay

The game is played entirely through a keyboard-driven terminal interface. No mouse required.

```
Authorized use only. All sessions are recorded.

Welcome to nx-field-01.ops.nexuscorp.int
Nexus OS 4.1.0-hardened (x86_64)

Last login: Fri, 28 Mar 2025 09:14:22 UTC from 10.99.0.44

  DISPATCH NOTICE — OPS TICKET #NX-2847
  Target   : IronGate Corp
  Entry    : contractor_portal (10.0.0.1)
  Objective: classified — you will know it when you find it.
```

### Core loop

1. **RECON** — `scan` the subnet to discover nodes and services
2. **EXPLOIT** — find vulnerabilities or credentials to gain access
3. **LOOT** — `ls` and `cat` files, `exfil` what matters
4. **PIVOT** — `connect` to the next node and go deeper

### Trace meter

Every action increases your trace percentage. At **61%** an automated Sentinel activates. At **100%** your session burns — you restart the layer but keep exfiltrated assets.

### Commands

| Command               | Description                                  |
| --------------------- | -------------------------------------------- |
| `help`                | List all commands                            |
| `status`              | Current trace, charges, node, tools          |
| `inventory`           | Credentials, tools, exfiltrated files        |
| `map`                 | Discovered network nodes                     |
| `scan [ip]`           | Probe a node or subnet (+1 trace)            |
| `connect [ip]`        | Move to a node                               |
| `login [user] [pass]` | Authenticate (+5 trace on failure)           |
| `ls [path]`           | List files on current node                   |
| `cat [file]`          | Read a file                                  |
| `exfil [file]`        | Copy file to inventory (+3 trace)            |
| `exploit [service]`   | Exploit a vulnerable service (costs charges) |
| `disconnect`          | Return to previous node                      |
| `wipe-logs`           | Reduce trace -15% (requires log-wiper tool)  |
| `clear`               | Clear terminal                               |

---

## Tech Stack

| Layer                  | Technology                                                      |
| ---------------------- | --------------------------------------------------------------- |
| Frontend               | Vite + React + TypeScript                                       |
| Styling                | Pure CSS — IBM VGA 8x16 font, ncurses/DOS aesthetic             |
| Game engine            | Client-side state machine (no backend needed for core gameplay) |
| AI — creative commands | Groq API (llama-3.3-70b) — Phase 3                              |
| AI — file content      | Google Gemini Flash — Phase 3                                   |
| AI — Aria dialogue     | Google Gemini Flash — Phase 3                                   |
| Hosting                | Vercel (static site + serverless functions)                     |
| Persistence            | localStorage (session) + Vercel KV (shared cache, Phase 3+)     |

---

## Project Structure

```
nexus-terminal-game/
├── public/
│   └── fonts/              # Self-hosted IBM VGA 8x16 font (int10h.org)
├── src/
│   ├── components/         # Terminal UI components
│   │   ├── Terminal.tsx
│   │   ├── TerminalHeader.tsx
│   │   ├── TerminalInput.tsx
│   │   ├── TerminalOutput.tsx
│   │   └── SuggestionBar.tsx
│   ├── data/
│   │   └── anchorNodes.ts  # 16 handcrafted story nodes
│   ├── engine/
│   │   ├── commands.ts     # Command resolution pipeline
│   │   ├── state.ts        # Initial state and helpers
│   │   ├── persistence.ts  # localStorage save/load
│   │   └── produce.ts      # Lightweight immutable update helper
│   ├── hooks/
│   │   ├── useSplash.ts        # Nexus Corp splash banner
│   │   ├── useBootSequence.ts  # Post-login MOTD animation
│   │   └── useCommandHistory.ts
│   ├── styles/
│   │   └── globals.css     # DOS/ncurses color palette
│   └── types/
│       ├── game.ts         # GameState, LiveNode, Credential, etc.
│       └── terminal.ts     # TerminalLine, LineType
├── .env.example
├── vercel.json
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

**Login credentials** (Nexus Corp operative):

```
login: ghost
password: nX-2847
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in your keys (required for Phase 3 AI features):

```bash
cp .env.example .env.local
```

```
GROQ_API_KEY=        # console.groq.com — free tier
GEMINI_API_KEY=      # aistudio.google.com — free tier
```

AI features are not required to play — the game engine works fully without them.

---

## Implementation Roadmap

| Phase             | Status     | Description                                                    |
| ----------------- | ---------- | -------------------------------------------------------------- |
| 1 — Foundation    | ✅ Done    | Terminal UI, splash, login, MOTD, CRT aesthetic                |
| 2 — Node Engine   | ✅ Done    | 16 anchor nodes, all engine commands, trace meter, persistence |
| 3 — AI Loop       | 🔜 Next    | Creative commands, AI file content, Aria placeholder           |
| 4 — World Map     | ⬜ Planned | Procedural filler nodes (38–52), employee pool generator       |
| 5 — Progression   | ⬜ Planned | Trace thresholds, Sentinel system, layer gating                |
| 6 — Aria          | ⬜ Planned | Aria subnetwork, dialogue, trust score, mutations              |
| 7 — Endings       | ⬜ Planned | 4 endings + post-game readout                                  |
| 8 — Replayability | ⬜ Planned | Dossier, contracts, fork decisions                             |
| 9 — Mutations     | ⬜ Planned | Unwinnable prevention, full Sentinel/Aria mutation log         |
| 10 — Polish       | ⬜ Planned | Authored content, balance pass, sound                          |

---

## Network Map

```
[L0] ENTRY          contractor_portal · vpn_gateway
[L1] OPS            ops_cctv_ctrl · ops_hr_db  (+16–20 filler)
[L2] SECURITY       sec_access_ctrl · sec_firewall  (+8–12 filler)
[L3] FINANCE        fin_payments_db · fin_exec_accounts  (+8–12 filler)
[L4] EXECUTIVE      exec_cfo · exec_legal · exec_ceo  (+6–8 filler)
[L5] ARIA           aria_surveillance · aria_behavioural · aria_personnel
                    aria_core · aria_decision
```

---

## License

MIT
