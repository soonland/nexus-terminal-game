import { AUTHORED_MAIL } from '../data/mail';
import type { GameState } from '../types/game';
import type { MailMessage, Mailbox } from '../types/mail';
import { isAriaNameKnown } from './ariaName';
import { mergeMail } from './mail';
import type { MailOwner } from './mail';
import { buildFallbackMailbox } from './mailFallback';
import produce from './produce';

// Mirrors MailDraft in api/mail.ts (api/ cannot import from src/).
interface MailDraft {
  counterpart: string;
  direction: 'in' | 'out';
  subject: string;
  body: string;
  day: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

const isDraft = (v: unknown): v is MailDraft => {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d['counterpart'] === 'string' &&
    (d['direction'] === 'in' || d['direction'] === 'out') &&
    typeof d['subject'] === 'string' &&
    typeof d['body'] === 'string' &&
    typeof d['day'] === 'number'
  );
};

const toMessages = (owner: MailOwner, drafts: MailDraft[]): MailMessage[] =>
  drafts.map((d, i) => {
    const id = `gen_${owner.id}_${String(i)}`;
    return {
      id,
      threadId: id,
      from: d.direction === 'in' ? d.counterpart : owner.name,
      to: d.direction === 'in' ? owner.name : d.counterpart,
      subject: d.subject,
      body: d.body,
      sentAt: `2024-10-${pad(Math.min(25, Math.max(1, Math.round(d.day))))}`,
      source: 'generated',
    };
  });

const currentLayer = (state: GameState): number =>
  state.network.nodes[state.network.currentNodeId]?.layer ?? 0;

const requestDrafts = async (state: GameState, owner: MailOwner): Promise<MailDraft[] | null> => {
  try {
    const res = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerName: owner.name,
        role: owner.role,
        division: owner.division ?? 'executive',
        workstation:
          (owner.workstationId && state.network.nodes[owner.workstationId]?.label) ?? 'N/A',
        trace: state.player.trace,
        layer: currentLayer(state),
        ariaNameKnown: isAriaNameKnown(state),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { messages?: unknown; unavailable?: boolean };
    if (data.unavailable === true || !Array.isArray(data.messages)) return null;
    const drafts = (data.messages as unknown[]).filter(isDraft);
    return drafts.length > 0 ? drafts : null;
  } catch {
    return null;
  }
};

const buildMailbox = async (state: GameState, owner: MailOwner): Promise<Mailbox> => {
  const drafts = await requestDrafts(state, owner);
  const extra = drafts
    ? toMessages(owner, drafts)
    : buildFallbackMailbox(owner, state.sessionSeed).messages;
  return { ownerId: owner.id, messages: mergeMail(AUTHORED_MAIL[owner.id] ?? [], extra) };
};

const lookup = (state: GameState, id: string): Mailbox | undefined =>
  (state.mailboxes as Partial<Record<string, Mailbox>>)[id];

// One request per run and owner, kept after it settles: a caller holding a stale state (the
// mailbox not stored yet) still gets the very same mailbox, so what is printed is what is stored.
const inflight = new Map<string, Promise<Mailbox>>();

// Opens a mailbox: returns the same state when it is already stored, otherwise generates it once
// (or falls back to local mail), stores it, and returns the new state.
export const ensureMailbox = async (state: GameState, owner: MailOwner): Promise<GameState> => {
  if (lookup(state, owner.id)) return state;
  const key = `${state.runId}:${owner.id}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = buildMailbox(state, owner);
    inflight.set(key, pending);
  }
  const mailbox = await pending;
  return produce(state, s => {
    s.mailboxes[owner.id] = mailbox;
  });
};

export const markMailRead = (state: GameState, messageIds: string[]): GameState => {
  const fresh = messageIds.filter(id => !state.mailRead.includes(id));
  if (fresh.length === 0) return state;
  return produce(state, s => {
    s.mailRead.push(...fresh);
  });
};
