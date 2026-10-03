// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExplorerWindow } from './ExplorerWindow';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import { fileReadKey } from '../types/game';
import type { GameFile, GameState } from '../types/game';

const NODE_ID = 'contractor_portal';

const makeFile = (path: string, overrides: Partial<GameFile> = {}): GameFile => ({
  name: path.split('/').pop() as string,
  path,
  type: 'document',
  content: `content of ${path}`,
  exfiltrable: true,
  accessRequired: 'user',
  ...overrides,
});

const stateWith = (files: GameFile[], mutate?: (s: GameState) => void): GameState =>
  produce(createInitialState(), s => {
    const node = s.network.nodes[NODE_ID]!;
    node.accessLevel = 'user';
    node.files = files;
    mutate?.(s);
  });

const setup = (state: GameState, disabled = false) => {
  const onRunCommand = vi.fn();
  const view = render(
    <ExplorerWindow gameState={state} onRunCommand={onRunCommand} disabled={disabled} />,
  );
  return { onRunCommand, ...view };
};

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });

const select = (name: string) => {
  fireEvent.click(screen.getByText(name));
};

describe('ExplorerWindow — tree', () => {
  it('shows top-level directories expanded and deeper ones collapsed until toggled', () => {
    setup(stateWith([makeFile('/var/www/site/index.html')]));
    expect(screen.getByText('var')).toBeTruthy();
    expect(screen.getByText('www')).toBeTruthy();
    expect(screen.queryByText('index.html')).toBeNull();
    fireEvent.click(screen.getByText('www'));
    expect(screen.getByText('site')).toBeTruthy();
  });

  it('collapses an expanded top-level directory', () => {
    setup(stateWith([makeFile('/etc/a.cfg')]));
    expect(screen.getByText('a.cfg')).toBeTruthy();
    fireEvent.click(screen.getByText('etc'));
    expect(screen.queryByText('a.cfg')).toBeNull();
  });

  it('hides files the player cannot access or that are deleted', () => {
    setup(
      stateWith([
        makeFile('/a/ok.txt'),
        makeFile('/a/admin.txt', { accessRequired: 'admin' }),
        makeFile('/a/gone.txt', { deleted: true }),
      ]),
    );
    expect(screen.getByText('ok.txt')).toBeTruthy();
    expect(screen.queryByText('admin.txt')).toBeNull();
    expect(screen.queryByText('gone.txt')).toBeNull();
  });

  it('shows ls-style badges', () => {
    setup(
      stateWith([
        makeFile('/a/trap.txt', { tripwire: true }),
        makeFile('/a/pinned.txt', { exfiltrable: false }),
        makeFile('/a/sealed.txt', { locked: true }),
        makeFile('/a/tool.bin', { isTool: true }),
      ]),
    );
    expect(screen.getByText('[!]')).toBeTruthy();
    expect(screen.getByText('[no-exfil]')).toBeTruthy();
    expect(screen.getByText('[LOCKED]')).toBeTruthy();
    expect(screen.getByText('[TOOL]')).toBeTruthy();
  });

  it('marks files that have been read', () => {
    const state = stateWith([makeFile('/a/seen.txt'), makeFile('/a/unseen.txt')], s => {
      s.filesRead = [fileReadKey(NODE_ID, '/a/seen.txt')];
    });
    setup(state);
    expect(screen.getAllByLabelText('read')).toHaveLength(1);
  });

  it('shows permission denied instead of the node tree when not authenticated', () => {
    const state = stateWith([makeFile('/a/secret.txt')], s => {
      s.network.nodes[NODE_ID]!.accessLevel = 'none';
    });
    setup(state);
    expect(screen.getByText(/not authenticated/i)).toBeTruthy();
    expect(screen.queryByText('secret.txt')).toBeNull();
  });
});

describe('ExplorerWindow — selection and actions', () => {
  it('selecting a file shows details but runs no command', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]));
    select('vpn.cfg');
    expect(screen.getByText('/etc/vpn.cfg')).toBeTruthy();
    expect(onRunCommand).not.toHaveBeenCalled();
  });

  it('warns about the trace cost of a tripwire file when selected', () => {
    setup(stateWith([makeFile('/a/trap.txt', { tripwire: true })]));
    select('trap.txt');
    expect(screen.getByText(/reading this file triggers up to \+25 trace/i)).toBeTruthy();
  });

  it('Open runs cat with the full path', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]));
    select('vpn.cfg');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onRunCommand).toHaveBeenCalledWith('cat /etc/vpn.cfg');
  });

  it('double-clicking a file also opens it', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]));
    fireEvent.doubleClick(screen.getByText('vpn.cfg'));
    expect(onRunCommand).toHaveBeenCalledWith('cat /etc/vpn.cfg');
  });

  it('targets the right file when two directories hold the same file name', () => {
    const { onRunCommand } = setup(
      stateWith([makeFile('/etc/a/config.ini'), makeFile('/etc/b/config.ini')]),
    );
    fireEvent.click(screen.getByText('a'));
    fireEvent.click(screen.getByText('b'));
    const [, second] = screen.getAllByText('config.ini');
    fireEvent.click(second);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onRunCommand).toHaveBeenCalledWith('cat /etc/b/config.ini');
  });

  it('Exfil runs exfil with the full path', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]));
    select('vpn.cfg');
    fireEvent.click(screen.getByRole('button', { name: 'Exfil' }));
    expect(onRunCommand).toHaveBeenCalledWith('exfil /etc/vpn.cfg');
  });

  it('disables Exfil for no-exfil files', () => {
    setup(stateWith([makeFile('/a/pinned.txt', { exfiltrable: false })]));
    select('pinned.txt');
    expect(button('Exfil').disabled).toBe(true);
  });

  it('disables Open and Exfil while disabled', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/etc/vpn.cfg')]), true);
    select('vpn.cfg');
    expect(button('Open').disabled).toBe(true);
    expect(button('Exfil').disabled).toBe(true);
    fireEvent.doubleClick(screen.getByText('vpn.cfg', { selector: '.explorer-file span' }));
    expect(onRunCommand).not.toHaveBeenCalled();
  });

  it('still lets Open run cat on a locked file so the terminal explains the denial', () => {
    const { onRunCommand } = setup(stateWith([makeFile('/a/sealed.txt', { locked: true })]));
    select('sealed.txt');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onRunCommand).toHaveBeenCalledWith('cat /a/sealed.txt');
  });

  it('clears the detail pane when the selected file disappears', () => {
    const state = stateWith([makeFile('/etc/vpn.cfg')]);
    const { rerender, onRunCommand } = setup(state);
    select('vpn.cfg');
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    const gone = produce(state, s => {
      s.network.nodes[NODE_ID]!.files[0].deleted = true;
    });
    rerender(<ExplorerWindow gameState={gone} onRunCommand={onRunCommand} disabled={false} />);
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });
});

describe('ExplorerWindow — viewer', () => {
  it('does not reveal content of an unread file even though content exists in state', () => {
    setup(stateWith([makeFile('/a/doc.txt', { content: 'TOP SECRET BODY' })]));
    select('doc.txt');
    expect(screen.getByText(/not read yet/i)).toBeTruthy();
    expect(screen.queryByText('TOP SECRET BODY')).toBeNull();
  });

  it('shows content once the file is in filesRead', () => {
    const state = stateWith([makeFile('/a/doc.txt', { content: 'TOP SECRET BODY' })], s => {
      s.filesRead = [fileReadKey(NODE_ID, '/a/doc.txt')];
    });
    setup(state);
    select('doc.txt');
    expect(screen.getByText('TOP SECRET BODY')).toBeTruthy();
  });

  it('keeps the placeholder for a read file whose content is still null', () => {
    const state = stateWith([makeFile('/a/doc.txt', { content: null })], s => {
      s.filesRead = [fileReadKey(NODE_ID, '/a/doc.txt')];
    });
    setup(state);
    select('doc.txt');
    expect(screen.getByText(/not read yet/i)).toBeTruthy();
  });
});

describe('ExplorerWindow — local cache', () => {
  const withLocal = (files: GameFile[]) =>
    stateWith([makeFile('/a/ok.txt')], s => {
      s.player.exfiltrated = files;
    });

  it('lists exfiltrated files under Local and always shows their content', () => {
    setup(withLocal([makeFile('/var/db/loot.csv', { content: 'LOOT BODY' })]));
    fireEvent.click(screen.getByText('db'));
    select('loot.csv');
    expect(screen.getByText('LOOT BODY')).toBeTruthy();
  });

  it('opens a local file with cat local:<path> and cannot exfil it again', () => {
    const { onRunCommand } = setup(withLocal([makeFile('/loot.csv')]));
    select('loot.csv');
    expect(button('Exfil').disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onRunCommand).toHaveBeenCalledWith('cat local:/loot.csv');
  });

  it('shows an empty-state hint when nothing has been exfiltrated', () => {
    setup(withLocal([]));
    expect(screen.getByText(/nothing exfiltrated yet/i)).toBeTruthy();
  });

  it('targets the right local file when two exfiltrated files share a name', () => {
    const { onRunCommand } = setup(
      withLocal([makeFile('/etc/a/config.ini'), makeFile('/etc/b/config.ini')]),
    );
    // The node tree also has an 'a' directory (from /a/ok.txt); the local one comes last.
    const last = (name: string) => screen.getAllByText(name).at(-1) as HTMLElement;
    fireEvent.click(last('a'));
    fireEvent.click(last('b'));
    const rows = screen.getAllByText('config.ini', { selector: '.explorer-file span' });
    fireEvent.click(rows[rows.length - 1]);
    fireEvent.click(button('Open'));
    expect(onRunCommand).toHaveBeenCalledWith('cat local:/etc/b/config.ini');
  });
});
