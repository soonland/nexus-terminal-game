import { CASE_PEOPLE } from '../data/casebook';
import type { DivisionId } from '../types/divisionSeed';
import type { GameState } from '../types/game';
import type { Mailbox, MailMessage } from '../types/mail';
import { knownCredentials } from './casebook';

// Whose mailbox it is. Employees are procedural; cast members are the casebook people that have a
// credential. Everything here is derived, so there is nothing to save.
export interface MailOwner {
  id: string;
  name: string;
  role: string;
  division: DivisionId | null;
  credentialId: string;
  username: string; // the account's login, e.g. j.mercer
  workstationId: string | null;
}

export const mailOwners = (state: GameState): MailOwner[] => {
  const logins = new Map(
    [...state.player.credentials, ...state.worldCredentials].map(c => [c.id, c.username]),
  );
  const cast = CASE_PEOPLE.flatMap(p =>
    (p.credentialIds ?? []).slice(0, 1).map(credentialId => ({
      id: p.id,
      name: p.name,
      role: p.role,
      division: null,
      credentialId,
      username: logins.get(credentialId) ?? p.id,
      workstationId: null,
    })),
  );
  const staff = state.employees.map(e => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName}`,
    role: e.role,
    division: e.divisionId,
    credentialId: `cred_${e.id}`,
    username: e.username,
    workstationId: e.workstationId,
  }));
  return [...cast, ...staff];
};

// A mailbox is unlocked once its owner's credential is known to the casebook (obtained, or shown
// in a document the player has read).
export const unlockedOwners = (state: GameState): MailOwner[] => {
  const known = new Set(knownCredentials(state).map(c => c.id));
  return mailOwners(state).filter(o => known.has(o.credentialId));
};

export const findUnlockedOwner = (state: GameState, query: string): MailOwner | null => {
  const q = query.trim().toLowerCase();
  if (q === '') return null;
  return (
    unlockedOwners(state).find(o => {
      const name = o.name.toLowerCase();
      const last = name.split(' ').pop() ?? name;
      const username = name.replace(/^(dr\.|[a-z]\.)\s*/, '').replace(/\s+/g, '.');
      return [o.id.toLowerCase(), name, last, username, o.username.toLowerCase()].includes(q);
    }) ?? null
  );
};

// Authored mail first (it always wins an id collision), then everything in date order.
export const mergeMail = (authored: MailMessage[], extra: MailMessage[]): MailMessage[] => {
  const taken = new Set(authored.map(m => m.id));
  const all = [...authored, ...extra.filter(m => !taken.has(m.id))];
  return all
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.sentAt.localeCompare(b.m.sentAt) || a.i - b.i)
    .map(x => x.m);
};

// How much mail the player holds. It only grows within a run, which is what the unread marker
// needs.
export const mailActivity = (state: GameState): number =>
  Object.values(state.mailboxes).reduce((n, b) => n + b.messages.length, 0);

// A mailbox by owner id; undefined until it has been opened.
export const mailboxOf = (state: GameState, ownerId: string): Mailbox | undefined =>
  (state.mailboxes as Partial<Record<string, Mailbox>>)[ownerId];

export const unreadCount = (state: GameState, ownerId: string): number => {
  const read = new Set(state.mailRead);
  const box = mailboxOf(state, ownerId);
  return (box?.messages ?? []).filter(m => !read.has(m.id)).length;
};

// Applies only what a mail action changed (a new mailbox, newly read ids) onto the latest state,
// so a slow mailbox request cannot overwrite turns taken meanwhile. A result from another run
// (the game was reset while it was pending) is dropped.
export const mergeMailResult = (
  prev: GameState,
  incoming: GameState,
  ownerId?: string,
): GameState => {
  if (prev.runId !== incoming.runId) return prev;
  const fresh = incoming.mailRead.filter(id => !prev.mailRead.includes(id));
  const box = ownerId === undefined ? undefined : incoming.mailboxes[ownerId];
  const addBox = ownerId !== undefined && box !== undefined && !mailboxOf(prev, ownerId);
  if (!addBox && fresh.length === 0) return prev;
  return {
    ...prev,
    mailboxes: addBox ? { ...prev.mailboxes, [ownerId]: box } : prev.mailboxes,
    mailRead: [...prev.mailRead, ...fresh],
  };
};

// A finished turn was built from the state at submit time: keep the mailboxes and read marks
// that landed in `latest` while it was pending. Another run's mail is never carried over.
export const carryMail = (latest: GameState, next: GameState): GameState => {
  if (latest.runId !== next.runId) return next;
  if (latest.mailboxes === next.mailboxes && latest.mailRead === next.mailRead) return next;
  return {
    ...next,
    mailboxes: { ...next.mailboxes, ...latest.mailboxes },
    mailRead: [...new Set([...next.mailRead, ...latest.mailRead])],
  };
};
