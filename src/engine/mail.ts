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
  workstationId: string | null;
}

export const mailOwners = (state: GameState): MailOwner[] => {
  const cast = CASE_PEOPLE.flatMap(p =>
    (p.credentialIds ?? []).slice(0, 1).map(credentialId => ({
      id: p.id,
      name: p.name,
      role: p.role,
      division: null,
      credentialId,
      workstationId: null,
    })),
  );
  const staff = state.employees.map(e => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName}`,
    role: e.role,
    division: e.divisionId,
    credentialId: `cred_${e.id}`,
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
      return [o.id.toLowerCase(), name, last, username].includes(q);
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

export const unreadCount = (state: GameState, ownerId: string): number => {
  const read = new Set(state.mailRead);
  const box = (state.mailboxes as Partial<Record<string, Mailbox>>)[ownerId];
  return (box?.messages ?? []).filter(m => !read.has(m.id)).length;
};
