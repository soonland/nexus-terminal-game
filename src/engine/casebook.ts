import { CASE_CREDENTIAL_SOURCES, CASE_FACTS, CASE_PEOPLE } from '../data/casebook';
import type { CaseFact } from '../data/casebook';
import { fileReadKey } from '../types/game';
import type { AccessLevel, Credential, GameState } from '../types/game';
import type { DivisionId } from '../types/divisionSeed';

// A credential as the casebook shows it. It deliberately carries no node ids, labels or source
// text: which password works where stays the player's puzzle.
interface CaseAccount {
  id: string; // the credential's id: a stable React key, even if two usernames ever repeat
  username: string;
  password: string;
  // Null until the credential has actually been obtained (a login or decrypt): a document that
  // shows a password never states the level, so showing it earlier would be a hint.
  accessLevel: AccessLevel | null;
}

interface CasePersonCard {
  id: string;
  kind: 'story' | 'holder';
  name: string;
  role: string;
  facts: CaseFact[];
  account: CaseAccount | null;
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

const DIVISION_LABEL: Record<DivisionId, string> = {
  external_perimeter: 'External perimeter',
  operations: 'Operations',
  security: 'Security',
  finance: 'Finance',
  executive: 'Executive',
};

const toAccount = (c: Credential): CaseAccount => ({
  id: c.id,
  username: c.username,
  password: c.password,
  accessLevel: c.obtained ? c.accessLevel : null,
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
  const claimedCredentialIds = new Set(CASE_PEOPLE.flatMap(p => p.credentialIds ?? []));
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
      kind: 'story',
      name: person.name,
      role: person.role,
      facts,
      account: credential ? toAccount(credential) : null,
    };
    return [{ card, rank, order }];
  });
  story.sort((a, b) => a.rank - b.rank || a.order - b.order);

  // ── Account holders: employees whose credential the player has obtained ──
  const employeeCredentialIds = new Set(state.employees.map(e => `cred_${e.id}`));
  const holders: CasePersonCard[] = state.employees.flatMap(employee => {
    const credential = knownById.get(`cred_${employee.id}`);
    if (!credential) return [];
    return [
      {
        id: employee.id,
        kind: 'holder' as const,
        name: `${employee.firstName} ${employee.lastName}`,
        role: `${employee.role}, ${DIVISION_LABEL[employee.divisionId]}`,
        facts: [],
        account: toAccount(credential),
      },
    ];
  });
  holders.sort((a, b) => a.name.localeCompare(b.name));

  // ── Accounts that belong to nobody ──
  const accounts = known
    .filter(c => !claimedCredentialIds.has(c.id) && !employeeCredentialIds.has(c.id))
    .map(toAccount);

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

  return { people: [...story.map(s => s.card), ...holders], timeline, accounts };
};
