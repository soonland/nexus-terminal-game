import type { Mailbox, MailMessage } from '../types/mail';
import type { MailOwner } from './mail';
import { createPRNG } from './prng';

// Used when /api/mail cannot answer. Routine office mail only, deterministic per owner and run
// seed, so a fallback mailbox reads the same if it is ever rebuilt.

interface Template {
  counterpart: string;
  direction: 'in' | 'out';
  subject: string;
  body: string;
}

const TEMPLATES: readonly Template[] = [
  {
    counterpart: 'IT Operations',
    direction: 'in',
    subject: 'Scheduled password rotation',
    body: 'Your password will rotate at the end of the month. No action is needed unless you see a prompt at login.',
  },
  {
    counterpart: 'Facilities Desk',
    direction: 'in',
    subject: 'Badge reader maintenance this week',
    body: 'Readers on your floor will be serviced one evening this week. Doors stay on the standby profile meanwhile.',
  },
  {
    counterpart: 'Human Resources',
    direction: 'in',
    subject: 'Benefits enrolment closes soon',
    body: 'A reminder that open enrolment closes on the 25th. Please review your selections in the portal.',
  },
  {
    counterpart: 'Team',
    direction: 'out',
    subject: 'Notes from this morning',
    body: 'Thanks all. Summary: the schedule holds, the open items stay with their owners, and we meet again next week.',
  },
  {
    counterpart: 'Procurement',
    direction: 'out',
    subject: 'Request: replacement equipment',
    body: 'Could you raise an order for a replacement unit for my desk? The old one is failing intermittently.',
  },
  {
    counterpart: 'Building Security',
    direction: 'in',
    subject: 'Visitor pass reminder',
    body: 'Visitors must be signed in at reception and escorted at all times. Please remind your guests.',
  },
  {
    counterpart: 'Finance Office',
    direction: 'in',
    subject: 'Expense reports due',
    body: 'Expense reports for this quarter are due by the 20th. Late submissions roll into the next cycle.',
  },
];

const pad = (n: number): string => String(n).padStart(2, '0');

const hash = (text: string): number => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return h >>> 0;
};

export const buildFallbackMailbox = (owner: MailOwner, sessionSeed: number): Mailbox => {
  const prng = createPRNG(sessionSeed + hash(owner.id));
  const count = 3 + Math.floor(prng() * 3); // 3..5
  const pool = [...TEMPLATES];
  const messages: MailMessage[] = [];
  for (let i = 0; i < count; i++) {
    const t = pool.splice(Math.floor(prng() * pool.length), 1)[0];
    const day = 1 + Math.floor(prng() * 25);
    const id = `fb_${owner.id}_${String(i)}`;
    messages.push({
      id,
      threadId: id,
      from: t.direction === 'in' ? t.counterpart : owner.name,
      to: t.direction === 'in' ? owner.name : t.counterpart,
      subject: t.subject,
      body: t.body,
      sentAt: `2024-10-${pad(day)}`,
      source: 'fallback',
    });
  }
  messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));
  return { ownerId: owner.id, messages };
};
