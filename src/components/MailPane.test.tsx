// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MailPane } from './MailPane';
import type { MailView } from './MailPane';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import type { GameState } from '../types/game';

const base = (): GameState =>
  produce(createInitialState(5), s => {
    for (const c of s.player.credentials) c.obtained = false;
  });

const withTorres = (opened = true): GameState =>
  produce(base(), s => {
    const c = s.player.credentials.find(x => x.id === 'cred_exec_assistant');
    if (c) c.obtained = true;
    s.network.currentNodeId = 'exec_cfo';
    s.network.nodes['exec_cfo']!.accessLevel = 'user';
    s.network.nodes['exec_cfo']!.discovered = true;
    if (opened) {
      s.mailboxes['torres'] = {
        ownerId: 'torres',
        messages: [
          {
            id: 'm1',
            threadId: 'm1',
            from: 'Facilities Desk',
            to: 'Elena Torres',
            subject: 'Badge readers',
            body: 'Serviced Thursday.',
            sentAt: '2024-10-07',
            source: 'authored',
            attachment: { nodeId: 'exec_cfo', path: '/home/cfo/documents/board_minutes_oct.pdf' },
          },
          {
            id: 'm2',
            threadId: 'm2',
            from: 'HR',
            to: 'Elena Torres',
            subject: 'Enrolment',
            body: 'Closes on the 25th.',
            sentAt: '2024-10-09',
            source: 'generated',
          },
        ],
      };
    }
  });

const NONE: MailView = { ownerId: null, messageId: null };

const setup = (state: GameState, view: MailView = NONE) => {
  const props = {
    onOpenMailbox: vi.fn(),
    onRead: vi.fn(),
    onOpenSource: vi.fn(),
    onView: vi.fn(),
  };
  render(<MailPane gameState={state} view={view} {...props} />);
  return props;
};

const TORRES: MailView = { ownerId: 'torres', messageId: null };
const M1: MailView = { ownerId: 'torres', messageId: 'm1' };

describe('MailPane', () => {
  it('says so when no mailbox is unlocked', () => {
    setup(base());
    expect(screen.getByText(/no mailboxes unlocked yet/i)).toBeTruthy();
  });

  it('lists only unlocked mailboxes, with the login name', () => {
    setup(withTorres(false));
    expect(screen.getByRole('button', { name: 'Elena Torres (e.torres)' })).toBeTruthy();
    expect(screen.queryByText(/Mercer/)).toBeNull();
  });

  it('asks the app to open a mailbox that has not been generated yet', () => {
    const props = setup(withTorres(false));
    fireEvent.click(screen.getByRole('button', { name: /Elena Torres/ }));
    expect(props.onOpenMailbox).toHaveBeenCalledWith('torres');
    expect(props.onView).toHaveBeenCalledWith(TORRES);
  });

  it('re-requests a missing mailbox for the selected owner without a click', () => {
    const props = setup(withTorres(false), TORRES);
    expect(screen.getByText(/syncing mailbox/i)).toBeTruthy();
    expect(props.onOpenMailbox).toHaveBeenCalledWith('torres');
  });

  it('does not re-request a mailbox that is already stored', () => {
    const props = setup(withTorres());
    fireEvent.click(screen.getByRole('button', { name: /Elena Torres/ }));
    expect(props.onOpenMailbox).not.toHaveBeenCalled();
    expect(props.onView).toHaveBeenCalledWith(TORRES);
  });

  it('shows the mailbox the view names, and reads one on click', () => {
    const props = setup(withTorres(), TORRES);
    expect(screen.getAllByText(/Badge readers|Enrolment/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Badge readers/ }));
    expect(props.onRead).toHaveBeenCalledWith('m1');
    expect(props.onView).toHaveBeenCalledWith(M1);
  });

  it('shows the message the view names', () => {
    setup(withTorres(), M1);
    expect(screen.getByText('Serviced Thursday.')).toBeTruthy();
  });

  it('syncs while the viewed mailbox is not stored yet', () => {
    setup(withTorres(false), TORRES);
    expect(screen.getByText(/syncing mailbox/i)).toBeTruthy();
  });

  it('turns an attachment into a link that opens its source', () => {
    const props = setup(withTorres(), M1);
    fireEvent.click(screen.getByRole('button', { name: /board_minutes_oct\.pdf/ }));
    expect(props.onOpenSource).toHaveBeenCalledWith({
      nodeId: 'exec_cfo',
      path: '/home/cfo/documents/board_minutes_oct.pdf',
    });
  });

  it('goes back from a message to the list', () => {
    const props = setup(withTorres(), M1);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(props.onView).toHaveBeenCalledWith(TORRES);
  });
});
