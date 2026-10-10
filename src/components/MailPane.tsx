import type { GameState } from '../types/game';
import { mailboxOf, unlockedOwners, unreadCount } from '../engine/mail';
import { sourceSelection } from './explorerShared';

interface Source {
  nodeId: string;
  path: string;
}

// What the pane shows: lifted to the workspace so a terminal command can drive it.
export interface MailView {
  ownerId: string | null;
  messageId: string | null;
}

interface Props {
  gameState: GameState;
  view: MailView;
  onView: (view: MailView) => void;
  onOpenMailbox: (ownerId: string) => void;
  onRead: (messageId: string) => void;
  onOpenSource: (source: Source) => void;
}

const fileName = (path: string): string => path.split('/').pop() ?? path;

export const MailPane = ({
  gameState,
  view,
  onView,
  onOpenMailbox,
  onRead,
  onOpenSource,
}: Props) => {
  const { ownerId, messageId } = view;
  const owners = unlockedOwners(gameState);
  const read = new Set(gameState.mailRead);
  const mailbox = ownerId === null ? undefined : mailboxOf(gameState, ownerId);
  const message = mailbox?.messages.find(m => m.id === messageId);
  const attachment = message?.attachment;

  if (owners.length === 0) {
    return (
      <div className="mail-pane">
        <p className="mail-empty">
          No mailboxes unlocked yet. Credentials open an employee&apos;s mail.
        </p>
      </div>
    );
  }

  const selectOwner = (id: string) => {
    onView({ ownerId: id, messageId: null });
    if (!mailboxOf(gameState, id)) onOpenMailbox(id);
  };

  return (
    <div className="mail-pane">
      <div className="mail-owners" role="group" aria-label="Mailboxes">
        {owners.map(o => {
          const unread = unreadCount(gameState, o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={ownerId === o.id}
              onClick={() => {
                selectOwner(o.id);
              }}>
              {`${o.name} (${o.username})`}
              {unread > 0 ? ` (${String(unread)})` : ''}
            </button>
          );
        })}
      </div>

      {ownerId !== null && !mailbox && <p className="mail-empty">syncing mailbox…</p>}

      {mailbox && !message && (
        <ul className="mail-list">
          {mailbox.messages.map(m => (
            <li key={m.id}>
              <button
                type="button"
                data-unread={!read.has(m.id)}
                onClick={() => {
                  onView({ ownerId, messageId: m.id });
                  onRead(m.id);
                }}>
                <span className="mail-date">{m.sentAt}</span>
                <span className="mail-from">{m.from}</span>
                <span className="mail-subject">{m.subject}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && (
        <article className="mail-message">
          <button
            type="button"
            onClick={() => {
              onView({ ownerId, messageId: null });
            }}>
            ← back
          </button>
          <dl>
            <dt>From</dt>
            <dd>{message.from}</dd>
            <dt>To</dt>
            <dd>{message.to}</dd>
            <dt>Date</dt>
            <dd>{message.sentAt}</dd>
            <dt>Subject</dt>
            <dd>{message.subject}</dd>
          </dl>
          <p className="mail-body">{message.body}</p>
          {attachment && sourceSelection(gameState, attachment) && (
            <button
              type="button"
              className="mail-attachment"
              onClick={() => {
                onOpenSource(attachment);
              }}>
              {`📎 ${fileName(attachment.path)}`}
            </button>
          )}
        </article>
      )}
    </div>
  );
};
