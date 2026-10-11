// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NodeMenu } from './NodeMenu';
import type { NodeAction } from '../engine/mapActions';

const act = (over: Partial<NodeAction> & { id: string }): NodeAction => ({
  kind: 'scan-host',
  label: over.id,
  command: over.id,
  cost: null,
  confirm: false,
  disabledReason: null,
  ...over,
});

const FREE = act({ id: 'connect', kind: 'connect', label: 'Connect', command: 'connect 10.0.0.2' });
const COSTLY = act({
  id: 'scan',
  label: 'Scan',
  command: 'scan 10.0.0.2',
  cost: '+1–2 trace',
  confirm: true,
});
const BLOCKED = act({
  id: 'exploit:http',
  kind: 'exploit',
  label: 'Exploit http',
  command: 'exploit http',
  cost: '1 charge, +2–7 trace',
  confirm: true,
  disabledReason: 'exploit-kit tool required',
});

const setup = (actions: NodeAction[], lockReason: string | null = null) => {
  const onRun = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <NodeMenu
      actions={actions}
      lockReason={lockReason}
      left={10}
      top={20}
      onRun={onRun}
      onClose={onClose}
    />,
  );
  return { onRun, onClose, ...view };
};

describe('NodeMenu', () => {
  it('renders a positioned menu with one entry per action', () => {
    setup([FREE, COSTLY, BLOCKED]);
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('10px');
    expect(menu.style.top).toBe('20px');
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(
      screen.getByRole('menuitem', { name: /Exploit http.*exploit-kit tool required/ }),
    ).toBeTruthy();
  });

  it('runs a free entry on the first click', () => {
    const { onRun } = setup([FREE]);
    fireEvent.click(screen.getByRole('menuitem', { name: /Connect/ }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith('connect 10.0.0.2');
  });

  it('asks for confirmation on a costly entry', () => {
    const { onRun } = setup([FREE, COSTLY]);
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan/ }));
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByText('Scan — +1–2 trace')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Run' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Connect/ })).toBeNull();
  });

  it('Run executes once and Cancel returns to the list', () => {
    const { onRun } = setup([FREE, COSTLY]);
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel' }));
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run' }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith('scan 10.0.0.2');
  });

  it('puts focus on the first entry, and on Cancel in the confirm view', () => {
    setup([FREE, COSTLY]);
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan/ }));
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Cancel' }));
  });

  it('Escape leaves the confirm view first, then closes', () => {
    const { onClose } = setup([COSTLY]);
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan/ }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: /Scan/ })).toBeTruthy();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a blocked entry is inert', () => {
    const { onRun } = setup([BLOCKED]);
    const item = screen.getByRole('menuitem');
    expect(item.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item);
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: 'Run' })).toBeNull();
  });

  it('a lock reason shows once and makes every entry inert, including Run', () => {
    const { onRun, rerender } = setup([FREE, COSTLY]);
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan/ }));
    const props = {
      actions: [FREE, COSTLY],
      left: 10,
      top: 20,
      onRun,
      onClose: vi.fn(),
    };
    rerender(<NodeMenu {...props} lockReason="Busy" />);
    expect(screen.getAllByRole('note')).toHaveLength(1);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run' }));
    expect(onRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel' }));
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.getAttribute('aria-disabled')).toBe('true');
    }
    fireEvent.click(screen.getByRole('menuitem', { name: /Connect/ }));
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByRole('note').textContent).toBe('Busy');
  });

  it('renders one inert entry when there are no actions', () => {
    const { onRun } = setup([]);
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toBe('No actions available');
    expect(items[0]?.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(items[0]);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('moves focus with the arrow, Home and End keys, wrapping', () => {
    setup([FREE, COSTLY, BLOCKED]);
    const items = screen.getAllByRole('menuitem');
    const key = (k: string) => fireEvent.keyDown(document.activeElement as HTMLElement, { key: k });
    key('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key('End');
    expect(document.activeElement).toBe(items[2]);
    key('ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    key('ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    key('Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('never renders the command, so a password cannot leak', () => {
    const LOGIN = act({
      id: 'login:x',
      kind: 'login',
      label: 'Login as ops.admin',
      command: 'login ops.admin IronG8te#Ops',
      cost: '+5 trace if it does not work here',
      confirm: true,
    });
    const { container } = setup([LOGIN]);
    expect(container.innerHTML).not.toContain('IronG8te#Ops');
    fireEvent.click(screen.getByRole('menuitem'));
    expect(screen.getByRole('menuitem', { name: 'Run' })).toBeTruthy();
    expect(container.innerHTML).not.toContain('IronG8te#Ops');
  });
});
