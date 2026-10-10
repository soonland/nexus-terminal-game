// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Workspace } from './Workspace';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import type { GameState } from '../types/game';

vi.mock('./CamPane', () => ({ CamPane: () => <div data-testid="cam-pane" /> }));

beforeEach(() => {
  localStorage.clear();
});

const at = (nodeId: string, access: 'none' | 'user'): GameState =>
  produce(createInitialState(), s => {
    s.network.currentNodeId = nodeId;
    s.network.nodes[nodeId]!.accessLevel = access;
  });

// One run for the whole test file: a new run id would reset the unread marker, as it should.
const BASE = createInitialState();
const held = (nodeIds: string[], current: string): GameState =>
  produce(BASE, s => {
    for (const id of nodeIds) s.network.nodes[id]!.accessLevel = 'user';
    s.network.currentNodeId = current;
  });

const view = (state: GameState) => (
  <Workspace
    terminal={<div />}
    gameState={state}
    nodeIp="10.1.0.1"
    trace={0}
    map={<div data-testid="map-pane" />}
    help={null}
    briefing={null}
    dossier={null}
    explorerDisabled={false}
    onRunCommand={vi.fn()}
    onTerminalFocused={vi.fn()}
    comms={<div />}
    commsAlert={false}
    commsActivity={0}
    onCommsFocused={vi.fn()}
    onOpenMailbox={vi.fn()}
    onReadMail={vi.fn()}
  />
);

describe('Workspace CAM tab', () => {
  it('appears on the CCTV controller and is gone after leaving, showing the map', () => {
    const view1 = render(view(at('ops_cctv_ctrl', 'user')));
    fireEvent.click(screen.getByRole('button', { name: 'CAM' }));
    expect(screen.getByTestId('cam-pane')).toBeTruthy();

    view1.rerender(view(at('contractor_portal', 'user')));
    expect(screen.queryByRole('button', { name: 'CAM' })).toBeNull();
    expect(screen.getByTestId('map-pane')).toBeTruthy();
  });

  it('does not jump back to CAM when the player returns to the controller', () => {
    const v = render(view(at('ops_cctv_ctrl', 'user')));
    fireEvent.click(screen.getByRole('button', { name: 'CAM' }));
    v.rerender(view(at('contractor_portal', 'user')));
    v.rerender(view(at('ops_cctv_ctrl', 'user')));
    expect(screen.queryByTestId('cam-pane')).toBeNull();
    expect(screen.getByTestId('map-pane')).toBeTruthy();
  });

  it('keeps the CAM tab while moving deeper, as long as the controller session is held', () => {
    render(view(held(['ops_cctv_ctrl', 'ops_hr_db'], 'ops_hr_db')));
    expect(screen.getByRole('button', { name: 'CAM' })).toBeTruthy();
  });

  it('shows no CAM tab for a run that went deep without ever taking the controller', () => {
    render(view(held(['sec_access_ctrl'], 'sec_access_ctrl')));
    expect(screen.queryByRole('button', { name: 'CAM' })).toBeNull();
  });

  it('falls back to the map when the controller session is lost while on CAM', () => {
    const v = render(view(held(['ops_cctv_ctrl'], 'ops_cctv_ctrl')));
    fireEvent.click(screen.getByRole('button', { name: 'CAM' }));
    v.rerender(view(held([], 'ops_cctv_ctrl')));
    expect(screen.queryByTestId('cam-pane')).toBeNull();
    expect(screen.getByTestId('map-pane')).toBeTruthy();
  });

  it('starts read, then marks the aux pane unread when a camera unlocks off-screen', () => {
    const v = render(view(held(['ops_cctv_ctrl'], 'ops_cctv_ctrl')));
    expect(document.body.textContent).not.toMatch(/4:aux\*?!/);
    v.rerender(view(held(['ops_cctv_ctrl', 'sec_access_ctrl'], 'sec_access_ctrl')));
    expect(document.body.textContent).toMatch(/4:aux\*?!/);
  });

  it('reads the unlock once the CAM tab is open', () => {
    const v = render(view(held(['ops_cctv_ctrl'], 'ops_cctv_ctrl')));
    fireEvent.click(screen.getByRole('button', { name: 'CAM' }));
    v.rerender(view(held(['ops_cctv_ctrl', 'sec_access_ctrl'], 'sec_access_ctrl')));
    expect(document.body.textContent).not.toMatch(/4:aux\*?!/);
  });
});
