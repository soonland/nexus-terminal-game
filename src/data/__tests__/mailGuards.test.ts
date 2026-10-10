import { describe, it, expect } from 'vitest';
import { AUTHORED_MAIL } from '../mail';
import { buildFallbackMailbox } from '../../engine/mailFallback';
import { mailOwners } from '../../engine/mail';
import { createInitialState } from '../../engine/state';
import type { MailMessage } from '../../types/mail';

const ARIA = /\baria\b/i; // word match: "Maria" is a common first name
const ACCUSING = /\b(mole|traitor|culprit|leaker|betray\w*|guilty|nexus)\b/i;

const texts = (m: MailMessage): string[] => [m.from, m.to, m.subject, m.body];

describe('mail text guards', () => {
  const state = createInitialState(11);
  const fallback = mailOwners(state).flatMap(o => buildFallbackMailbox(o, 11).messages);
  const authored = Object.values(AUTHORED_MAIL).flat();

  it('never says the secret name before the reveal', () => {
    const leaks = [...authored, ...fallback].flatMap(m => texts(m).filter(t => ARIA.test(t)));
    expect(leaks).toEqual([]);
  });

  it('never accuses anyone or names the mole or Nexus', () => {
    const hits = [...authored, ...fallback].flatMap(m => texts(m).filter(t => ACCUSING.test(t)));
    expect(hits).toEqual([]);
  });

  it('gives every authored message a unique id and a valid date', () => {
    const ids = authored.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of authored) {
      expect(m.sentAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.source).toBe('authored');
    }
  });

  it('keys authored mail by a real mail owner', () => {
    const owners = new Set(mailOwners(state).map(o => o.id));
    for (const ownerId of Object.keys(AUTHORED_MAIL)) expect(owners.has(ownerId)).toBe(true);
  });
});
