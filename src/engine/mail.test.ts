import { describe, it, expect } from 'vitest';
import {
  findUnlockedOwner,
  mailActivity,
  mailOwners,
  mergeMail,
  unlockedOwners,
  unreadCount,
} from './mail';
import { createInitialState } from './state';
import produce from './produce';
import type { GameState } from '../types/game';
import type { MailMessage } from '../types/mail';

const msg = (
  id: string,
  sentAt: string,
  source: MailMessage['source'] = 'generated',
): MailMessage => ({
  id,
  threadId: id,
  from: 'A',
  to: 'B',
  subject: id,
  body: id,
  sentAt,
  source,
});

const withObtained = (state: GameState, credentialId: string): GameState =>
  produce(state, s => {
    const c = s.player.credentials.find(x => x.id === credentialId);
    if (c) c.obtained = true;
  });

describe('mailOwners', () => {
  it('lists every employee and the cast members that have a credential', () => {
    const state = createInitialState(7);
    const owners = mailOwners(state);
    expect(owners.length).toBeGreaterThanOrEqual(state.employees.length);
    expect(owners.some(o => o.id === 'torres' && o.credentialId === 'cred_exec_assistant')).toBe(
      true,
    );
    const emp = state.employees[0];
    const owner = owners.find(o => o.id === emp.id);
    expect(owner?.credentialId).toBe(`cred_${emp.id}`);
    expect(owner?.name).toBe(`${emp.firstName} ${emp.lastName}`);
    expect(owner?.username).toBe(emp.username);
    expect(owners.find(o => o.id === 'torres')?.username).toBe('e.torres');
    expect(owners.find(o => o.id === 'mercer')?.username).toBe('j.mercer');
    expect(owners.find(o => o.id === 'hale')?.username).toBe('ceo.root');
  });
});

describe('unlockedOwners', () => {
  it('is empty before any credential is known', () => {
    const state = produce(createInitialState(7), s => {
      for (const c of s.player.credentials) c.obtained = false;
    });
    expect(unlockedOwners(state)).toEqual([]);
  });

  it('unlocks an owner once their credential is obtained', () => {
    const state = withObtained(
      produce(createInitialState(7), s => {
        for (const c of s.player.credentials) c.obtained = false;
      }),
      'cred_exec_assistant',
    );
    expect(unlockedOwners(state).map(o => o.id)).toEqual(['torres']);
  });
});

describe('findUnlockedOwner', () => {
  const state = withObtained(
    produce(createInitialState(7), s => {
      for (const c of s.player.credentials) c.obtained = false;
    }),
    'cred_exec_assistant',
  );

  it('matches by id, last name and full name, ignoring case', () => {
    expect(findUnlockedOwner(state, 'torres')?.id).toBe('torres');
    expect(findUnlockedOwner(state, 'TORRES')?.id).toBe('torres');
    expect(findUnlockedOwner(state, 'elena torres')?.id).toBe('torres');
  });

  it('matches the credential login name, ignoring case', () => {
    expect(findUnlockedOwner(state, 'e.torres')?.id).toBe('torres');
    expect(findUnlockedOwner(state, 'E.Torres')?.id).toBe('torres');
    const all = ['cred_sec_analyst', 'cred_exec_assistant', 'cred_ceo_root'].reduce(
      withObtained,
      state,
    );
    expect(findUnlockedOwner(all, 'j.mercer')?.id).toBe('mercer');
    expect(findUnlockedOwner(all, 'ceo.root')?.id).toBe('hale');
  });

  it('returns null for an unknown or still-locked name', () => {
    expect(findUnlockedOwner(state, 'mercer')).toBeNull();
    expect(findUnlockedOwner(state, 'nobody')).toBeNull();
    expect(findUnlockedOwner(state, '')).toBeNull();
  });
});

describe('mergeMail', () => {
  it('puts authored first, drops colliding ids and sorts by date', () => {
    const merged = mergeMail(
      [msg('a1', '2024-10-09', 'authored')],
      [msg('a1', '2024-10-01'), msg('g1', '2024-10-02'), msg('g2', '2024-10-12')],
    );
    expect(merged.map(m => m.id)).toEqual(['g1', 'a1', 'g2']);
    expect(merged.find(m => m.id === 'a1')?.source).toBe('authored');
  });
});

describe('activity and unread', () => {
  it('counts stored messages and unread ones per owner', () => {
    const state = produce(createInitialState(7), s => {
      s.mailboxes = {
        torres: { ownerId: 'torres', messages: [msg('m1', '2024-10-01'), msg('m2', '2024-10-02')] },
      };
      s.mailRead = ['m1'];
    });
    expect(mailActivity(state)).toBe(2);
    expect(unreadCount(state, 'torres')).toBe(1);
    expect(unreadCount(state, 'nobody')).toBe(0);
  });
});

describe('employee credentials promoted by login', () => {
  it('unlocks an employee whose credential moved from worldCredentials to the player', () => {
    const base = createInitialState(7);
    const emp = base.employees[0];
    const state = produce(base, s => {
      const idx = s.worldCredentials.findIndex(c => c.id === `cred_${emp.id}`);
      expect(idx).toBeGreaterThanOrEqual(0);
      const [promoted] = s.worldCredentials.splice(idx, 1);
      s.player.credentials.push({ ...promoted, obtained: true });
    });
    expect(unlockedOwners(state).map(o => o.id)).toContain(emp.id);
    const full = `${emp.firstName} ${emp.lastName}`;
    expect(findUnlockedOwner(state, full)?.id).toBe(emp.id);
    expect(findUnlockedOwner(state, full.toUpperCase())?.id).toBe(emp.id);
    expect(findUnlockedOwner(state, emp.username)?.id).toBe(emp.id);
  });
});
