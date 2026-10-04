# CASE tab — design

## Goal

The game has a lot of lore, names and credentials, and players struggle to keep track of them.
The aux pane's NOTES tab becomes **CASE**: an automatic casebook that collects the people the
player has met, a timeline of dated events, and the accounts, nodes and files they already had,
each item tied to the document it came from. It grows only as the player reads, never states a
conclusion, and keeps every item in exactly one place.

## Decisions (agreed)

| Question | Decision |
| --- | --- |
| How entries are discovered | **Authored per document**, derived from `filesRead` (no text scanning). |
| Who is listed | **Story characters** plus **employees whose credentials the player has obtained**. |
| Where it lives | **Reuse the NOTES panel**, renamed **CASE**; no duplicated information. |
| Panel name | **CASE** (aux tabs: MAP, CASE). |
| Duplication rule | Every item appears **once**: a credential lives on its person's card, otherwise under ACCOUNTS. |
| Player-written notes | Out of scope for this change. |

## Data

`src/data/casebook.ts` (authored; every text obeys the naming rule):

```ts
interface CasePerson {
  id: string;                 // 'kessler'
  name: string;               // 'Hannah Kessler'
  role: string;               // 'Junior analyst, Risk Analytics'
  credentialIds?: string[];   // credentials that belong to this person
}

interface CaseFact {
  id: string;
  person: string | null;      // exactly one subject; null = an event about no one (timeline only)
  text: string;               // neutral, factual, what the source says
  title?: string;             // short label for the timeline (<= 8 words)
  date?: string;              // 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM'
  source: { nodeId: string; path: string };
  quote: string;              // verbatim snippet of the source (a test pins it)
}
```

- A fact unlocks when `fileReadKey(source.nodeId, source.path)` is in `state.filesRead`. A person
  appears once any of their facts, or a credential of theirs, is unlocked.
- **Account holders** are derived, not authored: an `Employee` whose credential (`cred_<empId>`,
  `source === empId`) has `obtained: true`. Their card shows name, division, role, username,
  email, workstation label and access level. The internal `traits` are never shown.
- **Excluded on purpose:** O.R. (the player's own handler; the DMZ beacon that carries the
  initial is for the player to connect), and the AI and Sentinel (not people; listing them
  would spoil the twist).
- **No new saved state.** Everything derives from `filesRead`, obtained credentials and the
  nodes. `SAVE_VERSION` is unchanged.

### Credentials found in documents

A credential counts as **known** once the player has read a document that shows it in plain
text, not only once they have used it (`CASE_CREDENTIAL_SOURCES`: the camera config, the
contractor welcome page, the Mercer ticket and note, the firewall backup, the Postgres admin
config, the calendar access config). The list is authored rather than scanned for, because the
encrypted archive also contains passwords that must stay behind `decrypt`. A test checks that
each listed document really shows the password. The **access level appears only once the
credential has been obtained**: documents never state it, so showing it earlier would be a hint.

## The CASE tab

Aux pane tabs: **MAP | CASE**. Collapsible sections, in this order, each remembering whether it
is open (session state): **PEOPLE** (open by default), **TIMELINE**, **ACCOUNTS**, **NODES**,
**FILES**.

- **PEOPLE:** story characters first (in the order the player learned them), then account
  holders alphabetically. A card shows name and role, then each unlocked fact with its source,
  then the person's credential if obtained (`username / password` and access level).
- **TIMELINE:** unlocked dated facts in chronological order: `date  subject  title`. It never
  repeats a fact's text; selecting a line scrolls to the person's card.
- **ACCOUNTS:** obtained credentials that belong to nobody (`contractor`, `ops.admin`,
  `sec.root`, `fin.dba`, ...), with the password and access level, and nothing about where they work.
- **NODES / FILES:** today's discovered-nodes and exfiltrated-files lists, unchanged.
- **Sources** are links when the file can be reached (it is on the current node, or the player
  has exfiltrated it): selecting it selects the file in the FILES and DOC panes. Otherwise the
  source shows as plain text with the node's name.
- **Passwords are shown** for obtained credentials (confirmed). Today's NOTES lists only the
  username and access level, so players had to write passwords down themselves, which is the
  problem this change fixes. **It never says where a credential works** (`validOnNodes`) or where
  it was found (`source`): which password to try on which node stays the player's puzzle.
- **Commands:** `case` focuses the tab. `notes` stays as an alias. `map` is unchanged.
- **Unread:** a ● on the aux pane's title when new entries arrive while the CASE tab is not
  showing (reuses the `useUnread` mechanism; a resumed run starts read).

## Safety rails

- Pre-reveal the casebook never contains the secret name, and a test scans every authored string.
- It never labels anyone a suspect or states a conclusion. Cho appears exactly as the documents
  show him; nothing connects him to anything.
- Nothing unlocks from a document the player has not read.

## Testing

- **Content:** each fact's source node and path exist in `anchorNodes`, and the source's content
  contains `quote` verbatim (authored files only; AI-generated files carry no facts). Persons and
  facts have unique ids; every fact's person exists; dates are valid.
- **Guards:** no authored string matches `/aria/i` or `/suspect|guilty|mole|traitor/i`.
- **Engine (pure):** unlocking is driven by `filesRead`; an obtained credential unlocks its person;
  a save and load rebuild the same casebook; account holders derive only from obtained
  credentials and expose no `traits`; each credential appears once (on a card or in ACCOUNTS);
  timeline order, including same-day entries.
- **No hints:** no rendered credential line contains a node id, IP, label or `source` text.
- **Component:** sections render and remember open state; a source is a link only when the file
  is reachable, and selecting it sets the explorer selection; the unread dot.
- **Browser:** a short Playwright pass: read a few documents, check the cards, timeline and links.

## Delivery

One PR on `feat/case-tab`: the engine and data (`src/engine/casebook.ts`, `src/data/casebook.ts`),
the CASE component replacing `NotesModal`, the rename and `case` command, the guide, help and
`CLAUDE.md`. The authored facts (about 40, drawn from the story documents) are listed in the
implementation plan for review before they are committed.

## Delivered

Implemented in #235 on `feat/case-tab` (plan: `docs/superpowers/plans/2026-10-04-case-tab.md`).
37 authored facts across 10 people, every quote verified against its document.

## Out of scope

Player-written notes, search, filtering, employees from rosters, a relationship graph,
cross-run persistence, any change to what documents say.
