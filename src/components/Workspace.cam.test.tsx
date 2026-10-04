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
});
