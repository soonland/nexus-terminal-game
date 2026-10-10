// Where a message came from. Authored mail is hand-written and always present; generated mail
// came from /api/mail; fallback mail is the local template used when the API could not answer.
export type MailSource = 'authored' | 'generated' | 'fallback';

export interface MailMessage {
  id: string;
  threadId: string;
  from: string; // display name
  to: string; // display name
  subject: string;
  body: string;
  sentAt: string; // in-world date, 'YYYY-MM-DD'
  source: MailSource;
  attachment?: { nodeId: string; path: string };
}

export interface Mailbox {
  ownerId: string;
  messages: MailMessage[];
}
