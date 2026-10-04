// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CasePane } from './CasePane';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import { fileReadKey } from '../types/game';
import type { GameState } from '../types/game';

const scrollIntoView = vi.fn();

beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

const KESSLER_PATH = '/var/db/hr/terminated/kessler_h_2024-03.txt';

const atHr = (over: (s: GameState) => void = () => undefined): GameState =>
  produce(createInitialState(), s => {
    s.network.currentNodeId = 'ops_hr_db';
    s.network.nodes['ops_hr_db']!.accessLevel = 'user';
    s.network.nodes['ops_hr_db']!.discovered = true;
    s.filesRead.push(fileReadKey('ops_hr_db', KESSLER_PATH));
    over(s);
  });

const setup = (state: GameState) => {
  const onOpenSource = vi.fn();
  const view = render(<CasePane gameState={state} onOpenSource={onOpenSource} />);
  return { onOpenSource, ...view };
};

const section = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('CasePane — sections', () => {
  it('shows the five sections, PEOPLE open and the rest collapsed', () => {
    setup(createInitialState());
    for (const name of ['PEOPLE', 'TIMELINE', 'KNOWN CREDENTIALS', 'NODES', 'FILES']) {
      expect(section(name)).toBeTruthy();
    }
    expect(section('PEOPLE').getAttribute('aria-expanded')).toBe('true');
    expect(section('TIMELINE').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText(/no one yet/i)).toBeTruthy();
  });

  it('opens and closes a section', () => {
    setup(createInitialState());
    fireEvent.click(section('KNOWN CREDENTIALS'));
    expect(section('KNOWN CREDENTIALS').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/no credentials yet/i)).toBeTruthy();
    fireEvent.click(section('KNOWN CREDENTIALS'));
    expect(section('KNOWN CREDENTIALS').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/no credentials yet/i)).toBeNull();
  });
});

describe('CasePane — people', () => {
  it('shows a card with name, role and each fact', () => {
    setup(atHr());
    expect(screen.getByText('Hannah Kessler')).toBeTruthy();
    expect(screen.getByText(/Risk Analytics \(Level 1\)/)).toBeTruthy();
    expect(screen.getByText(/automated risk review of her/i)).toBeTruthy();
    expect(screen.getByText(/Separated on manager recommendation/)).toBeTruthy();
  });

  it('makes a source a link when the file can be opened, and selecting it reports the source', () => {
    const { onOpenSource } = setup(atHr());
    const links = screen.getAllByRole('button', { name: /kessler_h_2024-03\.txt/ });
    expect(links.length).toBeGreaterThan(0);
    fireEvent.click(links[0]);
    expect(onOpenSource).toHaveBeenCalledWith({ nodeId: 'ops_hr_db', path: KESSLER_PATH });
  });

  it('shows the source as plain text with the node name when the file is out of reach', () => {
    setup(
      atHr(s => {
        s.network.currentNodeId = 'contractor_portal';
      }),
    );
    expect(screen.queryByRole('button', { name: /kessler_h_2024-03\.txt/ })).toBeNull();
    expect(screen.getAllByText(/HR DATABASE/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/kessler_h_2024-03\.txt/).length).toBeGreaterThan(0);
  });

  it('an exfiltrated copy makes a source reachable from anywhere', () => {
    setup(
      atHr(s => {
        s.network.currentNodeId = 'contractor_portal';
        const file = s.network.nodes['ops_hr_db']!.files.find(f => f.path === KESSLER_PATH)!;
        s.player.exfiltrated.push({ ...file });
      }),
    );
    expect(
      screen.getAllByRole('button', { name: /kessler_h_2024-03\.txt/ }).length,
    ).toBeGreaterThan(0);
  });
});

describe('CasePane — credentials', () => {
  const withCredentials = (): GameState =>
    produce(atHr(), s => {
      for (const c of s.player.credentials) {
        if (['cred_contractor', 'cred_sec_analyst'].includes(c.id)) c.obtained = true;
      }
      s.filesRead.push(fileReadKey('ops_hr_db', '/var/db/hr/tickets/sec_ticket_2023_0601.txt'));
    });

  it('lists a shared credential with its password and level, and no owner', () => {
    setup(withCredentials());
    fireEvent.click(section('KNOWN CREDENTIALS'));
    const line = screen.getByTestId('case-account-contractor');
    expect(line.textContent).toContain('contractor');
    expect(line.textContent).toContain('Welcome1!');
    expect(line.textContent).toMatch(/USER/);
  });

  it("lists a credential under its owner, and the owner's card only names the account", () => {
    setup(withCredentials());
    fireEvent.click(section('KNOWN CREDENTIALS'));
    const row = screen.getByTestId('case-account-j.mercer');
    expect(row.textContent).toContain('S3ntinel99');
    expect(row.textContent).toContain('James Mercer');
    const card = screen.getByTestId('case-person-mercer');
    expect(card.textContent).toContain('j.mercer');
    expect(card.textContent).not.toContain('S3ntinel99');
    expect(screen.queryAllByTestId('case-account-j.mercer')).toHaveLength(1);
  });

  it('never says where a credential works or where it was found', () => {
    setup(withCredentials());
    fireEvent.click(section('KNOWN CREDENTIALS'));
    const state = withCredentials();
    for (const line of document.querySelectorAll('[data-testid^="case-account-"]')) {
      const text = line.textContent;
      for (const credential of state.player.credentials) {
        for (const nodeId of credential.validOnNodes) expect(text).not.toContain(nodeId);
        if (credential.source) expect(text).not.toContain(credential.source);
      }
      expect(text).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    }
  });
});

describe('CasePane — timeline, nodes and files', () => {
  it('lists dated facts with date, subject and title, and jumps to the person', () => {
    setup(atHr());
    fireEvent.click(section('TIMELINE'));
    const timeline = within(screen.getByTestId('case-timeline'));
    expect(timeline.getByText('2024-03-22')).toBeTruthy();
    expect(timeline.getByText('Separated')).toBeTruthy();
    const entry = screen.getByRole('button', { name: /2024-03-22/ });
    fireEvent.click(entry);
    expect(section('PEOPLE').getAttribute('aria-expanded')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('keeps the node and file lists the notes tab had', () => {
    setup(
      atHr(s => {
        const file = s.network.nodes['ops_hr_db']!.files.find(f => f.path === KESSLER_PATH)!;
        s.player.exfiltrated.push({ ...file });
      }),
    );
    fireEvent.click(section('NODES'));
    expect(screen.getByText(/10\.1\.0\.2/)).toBeTruthy();
    fireEvent.click(section('FILES'));
    expect(screen.getAllByText(KESSLER_PATH).length).toBeGreaterThan(0);
  });

  it("never renders an employee's internal traits", () => {
    const state = produce(createInitialState(), s => {
      const employee = s.employees[0];
      const world = s.worldCredentials.find(c => c.id === `cred_${employee.id}`)!;
      s.player.credentials.push({ ...world, obtained: true });
    });
    const { container } = setup(state);
    fireEvent.click(section('KNOWN CREDENTIALS'));
    const employee = state.employees[0];
    expect(container.textContent).toContain(`${employee.firstName} ${employee.lastName}`);
    for (const trait of employee.traits) expect(container.textContent).not.toContain(trait);
  });
});

describe('CasePane — a credential found in a document', () => {
  const read = (): GameState =>
    atHr(s => {
      s.filesRead.push(fileReadKey('ops_cctv_ctrl', '/etc/cctv/camera_config.ini'));
    });

  it('shows the password but no access level until it has been used', () => {
    setup(read());
    fireEvent.click(section('KNOWN CREDENTIALS'));
    const line = screen.getByTestId('case-account-ops.admin');
    expect(line.textContent).toContain('ops.admin');
    expect(line.textContent).toContain('IronG8te#Ops');
    expect(line.textContent).not.toMatch(/\[/);
  });

  it('shows the level once the credential is obtained', () => {
    setup(
      produce(read(), s => {
        for (const c of s.player.credentials) if (c.id === 'cred_ops_admin') c.obtained = true;
      }),
    );
    fireEvent.click(section('KNOWN CREDENTIALS'));
    expect(screen.getByTestId('case-account-ops.admin').textContent).toContain('[ADMIN]');
  });
});
