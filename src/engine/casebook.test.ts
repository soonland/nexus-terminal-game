import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildCasebook, casebookActivity } from './casebook';
import { createInitialState } from './state';
import { saveGame, loadGame } from './persistence';
import produce from './produce';
import { fileReadKey } from '../types/game';
import type { GameState } from '../types/game';

const KESSLER = fileReadKey('ops_hr_db', '/var/db/hr/terminated/kessler_h_2024-03.txt');
const VOTE = fileReadKey('exec_cfo', '/home/cfo/documents/PROJ_SENTINEL_BOARD_VOTE.pdf');
const INCIDENT = fileReadKey('ops_cctv_ctrl', '/var/logs/incident_2024_09.txt');
const RESET = fileReadKey('sec_firewall', '/var/log/sentinel/reset_log.txt');
const CAMERA = fileReadKey('ops_cctv_ctrl', '/etc/cctv/camera_config.ini');
const TICKET = fileReadKey('ops_hr_db', '/var/db/hr/tickets/sec_ticket_2023_0601.txt');
const ENCRYPTED = fileReadKey('sec_access_ctrl', '/home/j.mercer/encrypted_creds.gpg');

const withReads = (...keys: string[]): GameState =>
  produce(createInitialState(), s => {
    s.filesRead.push(...keys);
  });

const obtain = (state: GameState, ...ids: string[]): GameState =>
  produce(state, s => {
    for (const c of s.player.credentials) if (ids.includes(c.id)) c.obtained = true;
  });

// A login promotes an employee's world credential into the player's credentials.
const obtainEmployee = (state: GameState, employeeId: string): GameState =>
  produce(state, s => {
    const world = s.worldCredentials.find(c => c.id === `cred_${employeeId}`)!;
    s.player.credentials.push({ ...world, obtained: true });
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildCasebook — what unlocks', () => {
  it('is empty before anything is read or obtained', () => {
    expect(buildCasebook(createInitialState())).toEqual({ people: [], timeline: [], accounts: [] });
  });

  it('reading a document unlocks exactly the facts that cite it, and no other person', () => {
    const book = buildCasebook(withReads(KESSLER));
    expect(book.people.map(p => p.id)).toEqual(['kessler']);
    expect(book.people[0].facts.map(f => f.id).sort()).toEqual([
      'kessler_note',
      'kessler_review',
      'kessler_separation',
    ]);
  });

  it('an exfiltrated copy alone unlocks nothing: only a read of the original does', () => {
    const state = produce(createInitialState(), s => {
      const node = s.network.nodes['ops_hr_db']!;
      const file = node.files.find(f => f.path.includes('kessler_h_2024-03'))!;
      s.player.exfiltrated.push({ ...file });
    });
    expect(buildCasebook(state).people).toEqual([]);
  });

  it('reading a file twice does not duplicate anything', () => {
    const once = buildCasebook(withReads(KESSLER));
    const twice = buildCasebook(withReads(KESSLER, KESSLER));
    expect(twice).toEqual(once);
  });

  it('one document can unlock several people, in the order the player met them', () => {
    const book = buildCasebook(withReads(KESSLER, VOTE));
    expect(book.people.map(p => p.id)).toEqual(['kessler', 'hale', 'raman', 'greer', 'okafor']);
    const reversed = buildCasebook(withReads(VOTE, KESSLER));
    expect(reversed.people.map(p => p.id)).toEqual(['hale', 'raman', 'greer', 'okafor', 'kessler']);
  });
});

describe('buildCasebook — timeline', () => {
  it('lists dated unlocked facts in time order, pointing at their subject', () => {
    const book = buildCasebook(withReads(KESSLER, VOTE, INCIDENT));
    const dates = book.timeline.map(t => t.date);
    expect(dates).toEqual([...dates].sort());
    expect(book.timeline[0]).toMatchObject({ date: '2024-03-11', subject: 'kessler' });
    expect(book.timeline.some(t => t.date === '2024-09-14 02:34' && t.subject === 'torres')).toBe(
      true,
    );
  });

  it('puts an event about no one on the timeline with no subject, and never as a card', () => {
    const book = buildCasebook(withReads(RESET));
    const event = book.timeline.find(t => t.factId === 'ev_template');
    expect(event).toMatchObject({ subject: null, subjectName: null, date: '2024-11-26 03:14' });
    expect(book.people.map(p => p.id)).toEqual(['torres']); // the reset log also holds a fact about her
  });

  it('leaves undated facts off the timeline', () => {
    const book = buildCasebook(withReads(KESSLER));
    expect(book.timeline.map(t => t.factId)).not.toContain('kessler_note');
  });
});

describe('buildCasebook — known credentials', () => {
  it('lists a shared credential with its password and level, and no owner', () => {
    const book = buildCasebook(obtain(createInitialState(), 'cred_contractor'));
    expect(book.accounts).toEqual([
      {
        id: 'cred_contractor',
        username: 'contractor',
        password: 'Welcome1!',
        accessLevel: 'user',
        owner: null,
      },
    ]);
    expect(book.people).toEqual([]);
  });

  it("lists a story character's credential with their name as the owner, and a card that only names the account", () => {
    const book = buildCasebook(obtain(createInitialState(), 'cred_exec_assistant'));
    expect(book.accounts).toEqual([
      expect.objectContaining({ username: 'e.torres', owner: 'Elena Torres' }),
    ]);
    expect(book.people.map(p => p.id)).toEqual(['torres']);
    expect(book.people[0]?.account).toBe('e.torres'); // the username only, never the password
  });

  it('never repeats a password on a person card', () => {
    const book = buildCasebook(
      obtain(createInitialState(), 'cred_exec_assistant', 'cred_sec_analyst'),
    );
    const cards = JSON.stringify(book.people);
    expect(cards).not.toContain('Exec@ssist1');
    expect(cards).not.toContain('S3ntinel99');
  });

  it('never lists a credential that was not obtained', () => {
    expect(buildCasebook(createInitialState()).accounts).toEqual([]);
  });

  it('lists an employee whose credential is obtained, owned by name and role, with no card and no internals', () => {
    const base = createInitialState();
    const employee = base.employees[0];
    const book = buildCasebook(obtainEmployee(base, employee.id));
    expect(book.people).toEqual([]);
    expect(book.accounts).toHaveLength(1);
    expect(book.accounts[0]).toMatchObject({
      username: employee.username,
      owner: expect.stringContaining(`${employee.firstName} ${employee.lastName}`),
    });
    expect(book.accounts[0]?.owner).toContain(employee.role);
    expect(JSON.stringify(book)).not.toMatch(/traits|workstation/i);
  });

  it('ignores employees whose credential has not been obtained', () => {
    expect(buildCasebook(createInitialState()).accounts).toEqual([]);
  });

  it('lists every known credential exactly once', () => {
    const base = createInitialState();
    const employee = base.employees[0];
    const state = obtainEmployee(
      obtain(base, 'cred_contractor', 'cred_ops_admin', 'cred_sec_analyst', 'cred_exec_assistant'),
      employee.id,
    );
    const usernames = buildCasebook(state).accounts.map(a => a.username);
    expect(usernames.sort()).toEqual(
      ['contractor', 'ops.admin', 'j.mercer', 'e.torres', employee.username].sort(),
    );
  });

  it('never says where a credential works or where it was found', () => {
    const base = createInitialState();
    const state = obtain(base, 'cred_contractor', 'cred_sec_analyst', 'cred_ops_admin');
    const json = JSON.stringify(buildCasebook(state));
    for (const credential of state.player.credentials.filter(c => c.obtained)) {
      for (const nodeId of credential.validOnNodes) expect(json).not.toContain(nodeId);
      if (credential.source) expect(json).not.toContain(credential.source);
    }
    expect(json).not.toMatch(/validOnNodes|source"/);
  });
});

describe('buildCasebook — persistence', () => {
  it('rebuilds the same casebook after a save and a load', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    const state = obtain(
      withReads(KESSLER, VOTE, INCIDENT),
      'cred_contractor',
      'cred_exec_assistant',
    );
    saveGame(state);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(buildCasebook(loaded as GameState)).toEqual(buildCasebook(state));
  });
});

describe('buildCasebook — a credential found in a document counts before it is used', () => {
  it('reading the camera config lists ops.admin and its password, with no access level yet', () => {
    const book = buildCasebook(withReads(CAMERA));
    expect(book.accounts).toEqual([
      {
        id: 'cred_ops_admin',
        username: 'ops.admin',
        password: 'IronG8te#Ops',
        accessLevel: null,
        owner: null,
      },
    ]);
  });

  it('the access level appears only once the credential is actually obtained', () => {
    const used = buildCasebook(obtain(withReads(CAMERA), 'cred_ops_admin'));
    expect(used.accounts).toEqual([
      expect.objectContaining({ username: 'ops.admin', accessLevel: 'admin' }),
    ]);
  });

  it('lists it once, not twice, when it is both read and obtained', () => {
    const book = buildCasebook(obtain(withReads(CAMERA), 'cred_ops_admin'));
    expect(book.accounts).toHaveLength(1);
  });

  it("lists a person's credential under their name when a document shows it", () => {
    const book = buildCasebook(withReads(TICKET));
    expect(book.accounts).toEqual([
      expect.objectContaining({
        username: 'j.mercer',
        password: 'S3ntinel99',
        accessLevel: null,
        owner: 'James Mercer',
      }),
    ]);
    expect(book.people.find(p => p.id === 'mercer')?.account).toBe('j.mercer');
  });

  it('does not count the encrypted archive: only a decrypt (an obtained credential) reveals those', () => {
    const book = buildCasebook(withReads(ENCRYPTED));
    expect(book.accounts).toEqual([]);
    expect(book.people).toEqual([]);
  });

  it('a read of an exfiltrated copy alone shows nothing', () => {
    const state = produce(createInitialState(), s => {
      const file = s.network.nodes['ops_cctv_ctrl']!.files.find(f =>
        f.path.endsWith('camera_config.ini'),
      )!;
      s.player.exfiltrated.push({ ...file });
    });
    expect(buildCasebook(state).accounts).toEqual([]);
  });

  it('counts a document-found credential as casebook activity (the unread dot)', () => {
    const before = withReads();
    expect(casebookActivity(withReads(CAMERA))).toBe(casebookActivity(before) + 1);
  });

  it('still never says where it works or where it was found', () => {
    const json = JSON.stringify(buildCasebook(withReads(CAMERA, TICKET)));
    expect(json).not.toContain('ops_cctv_ctrl');
    expect(json).not.toContain('Found in plaintext config');
  });
});

describe('buildCasebook — account ids', () => {
  it('every credential carries its id, unique within the list', () => {
    const state = obtain(
      createInitialState(),
      'cred_contractor',
      'cred_ops_admin',
      'cred_sec_analyst',
      'cred_exec_assistant',
    );
    const ids = buildCasebook(state).accounts.map(a => a.id);
    expect(ids.sort()).toEqual(
      ['cred_contractor', 'cred_ops_admin', 'cred_sec_analyst', 'cred_exec_assistant'].sort(),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
