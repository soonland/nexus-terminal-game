Status: implemented (see docs/superpowers/plans/2026-10-09-mail.md)

# Mail — design

Sub-project 1 of 4 in the "world depth" update. The other three (depth content, ambient texture,
a world that reacts to the player) are separate specs; this one builds the mail interface they
deliver through.

## Intent

The player wants more lore and more immersive gameplay, with **depth of the world** as the main
feeling. Depth reaches the player through authored files, ambient terminal texture, optional side
threads, a world that reacts to them, and an **email interface**. This spec covers the email
interface only: a place where the people of IronGate leave a record the player can read once they
hold those people's credentials.

Success: stealing an employee's credentials leads to a mailbox with believable, dated mail in
that person's voice; the same mail after a reload; no blocked or empty mailbox when the AI is
offline; and no breach of the naming rule or the "accuse no one" rule.

## Decisions

- Interface: a **MAIL tab** in the aux pane (next to MAP and CASE) plus `mail` commands. Not a new
  pane, so layouts and presets are unchanged.
- Access: **per employee, via their credentials.** A mailbox is unlocked when a credential for its
  owner is known: obtained, or shown in a document the player has read (the casebook's
  `CASE_CREDENTIAL_SOURCES` rule). Unlocking is derived, never saved.
- Content: authored mail for the story cast, **AI-generated filler** for everyone else.
- Generation: **one call per mailbox on first open** (approach A). The result is stored, so it
  never changes. Per-message generation and boot-time pre-generation were rejected (many calls /
  wasted tokens and a slow boot).

## Data model and state

New `src/types/mail.ts`:

- `MailMessage`: `id`, `threadId`, `from`, `to`, `subject`, `body`, `sentAt` (in-world date),
  `source: 'authored' | 'generated' | 'fallback'`, optional `attachment` (a node file path).
- `Mailbox`: `{ ownerId, messages: MailMessage[] }`.

`GameState` gains:

- `mailboxes: Record<ownerId, Mailbox>`: only mailboxes the player has opened.
- `mailRead: string[]`: ids of messages read.

The fields are optional on `SaveState` in `src/engine/persistence.ts` (no `SAVE_VERSION` bump, since a mismatch discards the save); older saves load with empty mail.

Owners are `Employee`s (procedural) or authored cast members. Authored mail lives in
`src/data/mail.ts`, keyed by owner with fixed ids, and is always merged in ahead of generated
mail; generated ids can never collide with authored ones. The story threads themselves arrive in
the depth-content spec.

## `/api/mail` and the fallback

Request, validated in `api/_lib/validate.ts`: owner id, role, division, workstation label,
`sessionSeed`, trace level and layer as numbers, and a required `ariaNameKnown` boolean. Employee
`traits` are internal and are never sent.

Prompt, built like `api/_lib/tiers.ts`: persona → ALLOWED (routine office mail in the division's
voice, 4–8 messages, dates inside a stated window) → FORBIDDEN (the secret name while
`ariaNameKnown` is false, accusing any named person, naming the mole, Nexus, contradicting
authored facts) → strict JSON output contract.

Response: parsed and validated (bounded count and lengths, server-assigned ids, `from`/`to`
limited to the owner's email and a small allowed set), scrubbed with `api/_lib/ariaName.ts` while
the flag is false. Invalid output counts as an API failure.

Fallback, `src/engine/mailFallback.ts`: 3–5 templated routine messages from division and role,
seeded by `sessionSeed` (deterministic), marked `source: 'fallback'`. Used when the call fails or
the API answers `unavailable: true`, the same pattern as the `exploit` fallback. A mailbox is
never empty and never blocks play.

Client flow: first open of an unlocked mailbox shows "syncing mailbox…", calls the route, merges
authored threads by id, stores the result, renders it. Later opens read the stored mailbox with
no call.

## MAIL tab and commands

`src/components/MailPane.tsx`, a third aux tab. `mail` selects it, as `map` and `case` do.

- Mailbox selector on top: unlocked mailboxes by name and role; only unlocked mailboxes are listed, because listing locked ones would reveal every employee before the player meets them; `mail <name>` on a name that is not unlocked prints 'no credentials for that account'.
- Message list (unread bold, sender, subject, date) and a reading view. In the narrow layout they
  stack, with a back control.
- An attachment is a link into the explorer only when the file can be opened (the casebook rule).

Commands go through `handleSubmit` and `resolveCommand` as local commands with no trace cost:

- `mail` opens the tab and prints a one-line summary (mailboxes, unread).
- `mail <name>` switches mailbox and prints one line, `<Name> (<username>): <N> messages, <M> unread`;
  the pane selects that mailbox. A locked name prints "no credentials for that account". The name
  matches the owner id, full name, last name, derived `first.last` or the credential's login
  (`mail j.mercer`, `mail e.torres`, `mail ceo.root`), case-insensitively.
- `mail read <n>` prints one line, `Read: <subject>`, marks the message read and opens it in the
  pane; the terminal never shows the header or body. Reading in the pane also marks read.
- The terminal drives the pane through `WorkspaceHandle.showMail(ownerId, messageId?)`, which
  selects the MAIL tab and the view, and moves focus to the aux pane only when it is off screen.
  The mailbox selector shows `<Name> (<username>)`.

Unread: a new message in a mailbox the player holds marks the aux title and status bar through
`useUnread`; a resumed run starts read. `help` gets a `mail` entry; the suggestion bar offers
`mail` once the player holds a credential beyond their own.

## Testing and guards

The 75% per-file coverage threshold applies.

- Unit: unlock derivation, authored/generated merge by id, save migration, `mail` command paths
  (open, switch, read, locked), fallback determinism.
- Component: `MailPane` (selector, locked state, unread, narrow layout); `Workspace` with the new
  tab.
- API: validation, scrub, invalid output → fallback, `unavailable: true` → fallback; an MSW
  handler for `/api/mail` beside the other three.
- Guards: extend `ariaNameLeak` and `ariaNameWalk` to mail data and fallback templates; a new
  guard that no mail text accuses anyone or names the mole.
- Playthrough: a milestone for opening a mailbox once its credential is obtained.

## Out of scope

- The real story threads and extra staff content (depth-content spec).
- Mail that changes with trace, layer or player actions (reactive-world spec).
- Composing, sending or replying.
- Casebook facts sourced from mail.
- Ambient terminal texture.

## Risk

This adds a fourth AI route and one saved field, so it is the largest of the four sub-projects.
If the plan is too big, split it into (a) data, state and the tab with fallback-only content, then
(b) the AI route.
