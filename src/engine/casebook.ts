import { CASE_CREDENTIAL_SOURCES, CASE_FACTS, CASE_PEOPLE } from '../data/casebook';
import type { CaseFact } from '../data/casebook';
import { fileReadKey } from '../types/game';
import type { AccessLevel, Credential, GameState } from '../types/game';

// A credential as the casebook shows it. It deliberately carries no node ids, labels or source
// text: which password works where stays the player's puzzle.
interface CaseAccount {
  id: string; // the credential's id: a stable React key, even if two usernames ever repeat
  username: string;
  password: string;
  // Null until the credential has actually been obtained (a login or decrypt): a document that
  // shows a password never states the level, so showing it earlier would be a hint.
  accessLevel: AccessLevel | null;
  // Whose it is, when the casebook knows: a story character, or an employee (name and role).
  owner: string | null;
}

interface CasePersonCard {
  id: string;
  name: string;
  role: string;
  facts: CaseFact[];
  // The username of this person's credential. Never the password: KNOWN CREDENTIALS is the one
  // place a password is shown.
  account: string | null;
}

interface CaseTimelineEntry {
  date: string;
  subject: string | null;
  subjectName: string | null;
  title: string;
  factId: string;
}

export interface Casebook {
  people: CasePersonCard[];
  timeline: CaseTimelineEntry[];
  accounts: CaseAccount[];
}

const toAccount = (c: Credential, owner: string | null): CaseAccount => ({
  id: c.id,
  username: c.username,
  password: c.password,
  accessLevel: c.obtained ? c.accessLevel : null,
  owner,
});

// Credentials the casebook knows: obtained ones, plus those a read document shows in plain text.
const knownCredentials = (state: GameState): Credential[] => {
  const read = new Set(state.filesRead);
  const found = new Set(
    CASE_CREDENTIAL_SOURCES.filter(e => read.has(fileReadKey(e.source.nodeId, e.source.path))).map(
      e => e.credentialId,
    ),
  );
  return state.player.credentials.filter(c => c.obtained || found.has(c.id));
};

// How much the casebook holds: unlocked facts plus obtained credentials. It only ever grows
// within a run, which is what the unread marker needs.
export const casebookActivity = (state: GameState): number => {
  const read = new Set(state.filesRead);
  const facts = CASE_FACTS.filter(f => read.has(fileReadKey(f.source.nodeId, f.source.path)));
  return facts.length + knownCredentials(state).length;
};

// Everything here is derived from what the player has read and obtained, so there is nothing to
// save and a reload rebuilds the same casebook. A fact unlocks only when its source file is in
// `filesRead` (a read of the original, not just an exfiltrated copy).
export const buildCasebook = (state: GameState): Casebook => {
  // Position of each file's first read, for the order in which the player met people.
  const firstRead = new Map<string, number>();
  state.filesRead.forEach((key, index) => {
    if (!firstRead.has(key)) firstRead.set(key, index);
  });

  const unlocked = CASE_FACTS.filter(f =>
    firstRead.has(fileReadKey(f.source.nodeId, f.source.path)),
  );
  const known = knownCredentials(state);
  const knownById = new Map(known.map(c => [c.id, c]));

  // ── Story cards ──
  const story = CASE_PEOPLE.flatMap((person, order) => {
    const facts = unlocked.filter(f => f.person === person.id);
    const credential = (person.credentialIds ?? [])
      .map(id => knownById.get(id))
      .find((c): c is Credential => c !== undefined);
    if (facts.length === 0 && credential === undefined) return [];
    const rank = Math.min(
      ...facts.map(f => firstRead.get(fileReadKey(f.source.nodeId, f.source.path)) ?? Infinity),
    );
    const card: CasePersonCard = {
      id: person.id,
      name: person.name,
      role: person.role,
      facts,
      account: credential?.username ?? null,
    };
    return [{ card, rank, order }];
  });
  story.sort((a, b) => a.rank - b.rank || a.order - b.order);

  // ── Known credentials: one list, each tagged with its owner when the casebook knows it ──
  const ownerById = new Map<string, string>();
  for (const person of CASE_PEOPLE) {
    for (const id of person.credentialIds ?? []) ownerById.set(id, person.name);
  }
  for (const employee of state.employees) {
    ownerById.set(
      `cred_${employee.id}`,
      `${employee.firstName} ${employee.lastName}, ${employee.role}`,
    );
  }
  const accounts = known.map(c => toAccount(c, ownerById.get(c.id) ?? null));

  // ── Timeline ──
  const nameOf = new Map(CASE_PEOPLE.map(p => [p.id, p.name]));
  const timeline: CaseTimelineEntry[] = unlocked
    .flatMap(f =>
      f.date === undefined
        ? []
        : [
            {
              date: f.date,
              subject: f.person,
              subjectName: f.person === null ? null : (nameOf.get(f.person) ?? null),
              title: f.title ?? '',
              factId: f.id,
            },
          ],
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.factId.localeCompare(b.factId));

  return { people: story.map(s => s.card), timeline, accounts };
};
