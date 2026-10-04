// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CamMenu } from './CamMenu';
import { CAMERA_FEEDS } from '../data/cameras';

const feedsUpTo = (layer: number) =>
  CAMERA_FEEDS.flatMap(f => {
    const live = layer >= f.unlockLayer;
    return live || f.offlineReason !== null ? [{ ...f, live }] : [];
  });

const setup = (layer = 1, selectedId = 'lobby-reception') => {
  const onSelect = vi.fn();
  const view = render(
    <CamMenu feeds={feedsUpTo(layer)} selectedId={selectedId} onSelect={onSelect} />,
  );
  return { onSelect, ...view };
};

const opener = () => screen.getByRole('button', { name: /GROUND FLOOR › Lobby \(reception\)/i });
const floorNames = () =>
  screen.getAllByRole('menuitem').map(el => el.textContent.replace(/\s*▸$/, ''));
const floorItem = (name: RegExp) => screen.getByRole('menuitem', { name });
const cameraItem = (name: string) => screen.queryByRole('menuitemradio', { name });
const dataItems = (column: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-column="${column}"] [data-menu-item]`));

describe('CamMenu', () => {
  it('shows where the player is on the opener, and starts closed', () => {
    setup();
    expect(opener().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists only floors that have a listed camera, in order', () => {
    setup(1);
    fireEvent.click(opener());
    expect(floorNames()).toEqual(['GROUND FLOOR', 'OPERATIONS', 'EXECUTIVE']);
  });

  it('adds floors as layers are reached', () => {
    setup(5);
    fireEvent.click(opener());
    expect(floorNames()).toEqual([
      'GROUND FLOOR',
      'OPERATIONS',
      'SECURITY',
      'FINANCE',
      'EXECUTIVE',
      'SUB-LEVEL B',
    ]);
  });

  it("opens with the current floor's cameras beside the floor list", () => {
    setup();
    fireEvent.click(opener());
    expect(cameraItem('Lobby (reception)')).toBeTruthy();
    expect(cameraItem('Lobby (entrance)')).toBeTruthy();
    expect(cameraItem('Server room (aisle)')).toBeNull();
    expect(floorItem(/GROUND FLOOR/).getAttribute('aria-expanded')).toBe('true');
  });

  it("hovering a floor shows its cameras in place of the previous floor's", () => {
    setup();
    fireEvent.click(opener());
    fireEvent.mouseEnter(floorItem(/OPERATIONS/));
    expect(cameraItem('Server room (aisle)')).toBeTruthy();
    expect(cameraItem('Server room (airlock)')).toBeTruthy();
    expect(cameraItem('Lobby (reception)')).toBeNull();
    expect(floorItem(/OPERATIONS/).getAttribute('aria-expanded')).toBe('true');
    expect(floorItem(/GROUND FLOOR/).getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking a floor shows its cameras and moves focus into them', () => {
    setup();
    fireEvent.click(opener());
    fireEvent.click(floorItem(/OPERATIONS/));
    expect(cameraItem('Server room (aisle)')).toBeTruthy();
    expect(document.activeElement).toBe(cameraItem('Server room (aisle)'));
  });

  it('selects a camera, calls back and closes', () => {
    const { onSelect } = setup();
    fireEvent.click(opener());
    fireEvent.click(cameraItem('Lobby (entrance)')!);
    expect(onSelect).toHaveBeenCalledWith('lobby-entrance');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('marks the selected camera and dims the offline ones', () => {
    setup(1);
    fireEvent.click(opener());
    expect(cameraItem('Lobby (reception)')!.getAttribute('aria-checked')).toBe('true');
    fireEvent.mouseEnter(floorItem(/EXECUTIVE/));
    const corridor = screen.getByRole('menuitemradio', { name: /Executive corridor/ });
    expect(corridor.textContent).toContain('offline');
    expect(corridor.className).toContain('cam-menu-off');
  });

  it('closes on Escape and on a click outside', () => {
    setup();
    fireEvent.click(opener());
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(opener());
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves through the floors with the arrow keys, wrapping around', () => {
    setup();
    fireEvent.click(opener());
    const floors = dataItems('floors');
    floors[0].focus();
    fireEvent.keyDown(floors[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(floors[1]);
    fireEvent.keyDown(floors[1], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(floors[0]);
    fireEvent.keyDown(floors[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(floors.at(-1));
  });

  it('opens a floor with ArrowRight, moves through its cameras, and returns with ArrowLeft', () => {
    setup();
    fireEvent.click(opener());
    const operations = floorItem(/OPERATIONS/);
    operations.focus();
    fireEvent.keyDown(operations, { key: 'ArrowRight' });
    const cameras = dataItems('cameras');
    expect(cameras.map(c => c.textContent)).toEqual([
      'Server room (aisle)',
      'Server room (airlock)',
    ]);
    expect(document.activeElement).toBe(cameras[0]);
    fireEvent.keyDown(cameras[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cameras[1]);
    fireEvent.keyDown(cameras[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(operations);
  });

  it('goes back from the cameras with Escape without closing the menu', () => {
    setup();
    fireEvent.click(opener());
    const operations = floorItem(/OPERATIONS/);
    fireEvent.click(operations);
    fireEvent.keyDown(cameraItem('Server room (aisle)')!, { key: 'Escape' });
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(document.activeElement).toBe(operations);
  });

  it('shows a neutral label when the selected camera is no longer listed', () => {
    setup(1, 'finance-floor');
    expect(screen.getByRole('button', { name: /CAMERAS/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /CAMERAS/ }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').length).toBeGreaterThan(0);
  });

  it('never uses the secret name', () => {
    const { container } = setup(5);
    fireEvent.click(opener());
    expect(container.textContent).not.toMatch(/aria/i);
  });

  it('returns focus to the opener when a camera is chosen from the keyboard', () => {
    setup();
    fireEvent.click(opener());
    const operations = floorItem(/OPERATIONS/);
    operations.focus();
    fireEvent.keyDown(operations, { key: 'ArrowRight' });
    const airlock = cameraItem('Server room (airlock)')!;
    airlock.focus();
    fireEvent.click(airlock);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it('returns focus to the opener when Escape closes the menu', () => {
    setup();
    fireEvent.click(opener());
    const floors = dataItems('floors');
    floors[0].focus();
    fireEvent.keyDown(floors[0], { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it('does not steal focus when a click outside closes the menu', () => {
    setup();
    fireEvent.click(opener());
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    fireEvent.mouseDown(outside);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
