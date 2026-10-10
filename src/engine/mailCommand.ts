import type { GameState } from '../types/game';
import type { Mailbox } from '../types/mail';
import type { LineType } from '../types/terminal';
import { findUnlockedOwner, unlockedOwners, unreadCount } from './mail';
import { ensureMailbox, markMailRead } from './mailClient';

type Line = { type: LineType; content: string };

export interface MailCommandResult {
  lines: Line[];
  nextState?: GameState;
  showTab: boolean;
  ownerId?: string; // the mailbox that is now open
}

const line = (content: string, type: LineType = 'output'): Line => ({ type, content });
const err = (content: string): Line => line(content, 'error');

export const isMailCommand = (raw: string): boolean => /^mail(\s|$)/i.test(raw.trim());

const READ = /^read\s*(.*)$/i;

const boxOf = (state: GameState, ownerId: string): Mailbox | undefined =>
  (state.mailboxes as Partial<Record<string, Mailbox>>)[ownerId];

const listLines = (state: GameState, ownerId: string): Line[] => {
  const read = new Set(state.mailRead);
  const messages = boxOf(state, ownerId)?.messages ?? [];
  return messages.map((m, i) =>
    line(
      `  ${String(i + 1)}. [${read.has(m.id) ? ' ' : '*'}] ${m.sentAt}  ${m.from}  ${m.subject}`,
    ),
  );
};

const summary = (state: GameState): MailCommandResult => {
  const owners = unlockedOwners(state);
  if (owners.length === 0) {
    return {
      lines: [line("No mailboxes unlocked yet. Credentials open an employee's mail.", 'system')],
      showTab: true,
    };
  }
  const unread = owners.reduce((n, o) => n + unreadCount(state, o.id), 0);
  const plural = owners.length === 1 ? 'mailbox' : 'mailboxes';
  return {
    lines: [
      line(
        `Mail: ${String(owners.length)} ${plural} unlocked, ${String(unread)} unread. Use "mail <name>".`,
        'system',
      ),
    ],
    showTab: true,
  };
};

const readMessage = (
  raw: string,
  state: GameState,
  openOwnerId: string | null,
): MailCommandResult => {
  const box = openOwnerId === null ? undefined : boxOf(state, openOwnerId);
  if (openOwnerId === null || !box) {
    return { lines: [err('mail: open a mailbox first (mail <name>)')], showTab: false };
  }
  const n = /^\d+$/.test(raw) ? Number(raw) : 0;
  const message = n >= 1 && n <= box.messages.length ? box.messages[n - 1] : undefined;
  if (!message) return { lines: [err('mail: no such message')], showTab: false };
  return {
    lines: [
      line(`From: ${message.from}`),
      line(`To: ${message.to}`),
      line(`Date: ${message.sentAt}`),
      line(`Subject: ${message.subject}`),
      line(''),
      ...message.body.split('\n').map(b => line(b)),
    ],
    nextState: markMailRead(state, [message.id]),
    showTab: false,
    ownerId: openOwnerId,
  };
};

// `mail`, `mail <name>` and `mail read <n>`. Reading mail you hold credentials for costs no
// trace. `openOwnerId` is the mailbox the player opened last (kept by the caller).
export const runMailCommand = async (
  raw: string,
  state: GameState,
  openOwnerId: string | null,
): Promise<MailCommandResult> => {
  const arg = raw.trim().replace(/^mail\s*/i, '');
  if (arg === '') return summary(state);

  const read = READ.exec(arg);
  if (read) return readMessage(read[1].trim(), state, openOwnerId);

  const owner = findUnlockedOwner(state, arg);
  if (!owner) return { lines: [err('mail: no credentials for that account')], showTab: false };

  const next = await ensureMailbox(state, owner);
  const count = boxOf(next, owner.id)?.messages.length ?? 0;
  return {
    lines: [
      line(`${owner.name} (${owner.role}): ${String(count)} messages`, 'system'),
      ...listLines(next, owner.id),
      line('Use "mail read <n>" to read one.', 'system'),
    ],
    nextState: next === state ? undefined : next,
    showTab: true,
    ownerId: owner.id,
  };
};
