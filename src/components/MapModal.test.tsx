// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapModal } from './MapModal';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import type { GameState } from '../types/game';

const discoverAll = (current: string): GameState =>
  produce(createInitialState(), s => {
    for (const n of Object.values(s.network.nodes)) {
      if (n) n.discovered = true;
    }
    s.network.currentNodeId = current;
  });

const nodeOn = (layer: number) => {
  const n = Object.values(createInitialState().network.nodes).find(x => x?.layer === layer);
  if (!n) throw new Error(`no node on layer ${String(layer)}`);
  return n;
};

const ipPattern = (ip: string) => new RegExp(`${ip.replace(/\./g, '\\.')}\\s`);
const header = (re: RegExp) => screen.getByRole('button', { name: re });

describe('MapModal', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows discovered layer-5 nodes under neutral CASSANDRA labels, never Aria, before the reveal', () => {
    const state = produce(createInitialState(), s => {
      for (const n of Object.values(s.network.nodes)) {
        if (n?.layer === 5) n.discovered = true;
      }
    });
    const { container } = render(<MapModal gameState={state} />);
    expect(container.textContent).toMatch(/CASSANDRA/);
    expect(container.textContent).not.toMatch(/aria/i);
  });

  it('renders each level header as a button with aria-expanded', () => {
    render(<MapModal gameState={discoverAll(nodeOn(0).id)} />);
    for (const re of [/ENTRY/, /OPS/, /SECURITY/, /FINANCE/, /EXECUTIVE/, /CASSANDRA/]) {
      expect(header(re).getAttribute('aria-expanded')).not.toBeNull();
    }
  });

  it('starts with only the current node level open', () => {
    const current = nodeOn(1);
    render(<MapModal gameState={discoverAll(current.id)} />);
    expect(header(/OPS/).getAttribute('aria-expanded')).toBe('true');
    expect(header(/SECURITY/).getAttribute('aria-expanded')).toBe('false');
    expect(header(/ENTRY/).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText(ipPattern(current.ip))).toBeTruthy();
    expect(screen.queryByText(ipPattern(nodeOn(2).ip))).toBeNull();
  });

  it('toggles a level open and closed on click', () => {
    render(<MapModal gameState={discoverAll(nodeOn(1).id)} />);
    const ip = ipPattern(nodeOn(2).ip);
    fireEvent.click(header(/SECURITY/));
    expect(header(/SECURITY/).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(ip)).toBeTruthy();
    fireEvent.click(header(/SECURITY/));
    expect(header(/SECURITY/).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(ip)).toBeNull();
  });

  it('opens the new level when the player moves, without closing levels the player opened', () => {
    const { rerender } = render(<MapModal gameState={discoverAll(nodeOn(1).id)} />);
    fireEvent.click(header(/SECURITY/));
    rerender(<MapModal gameState={discoverAll(nodeOn(3).id)} />);
    expect(header(/FINANCE/).getAttribute('aria-expanded')).toBe('true');
    expect(header(/SECURITY/).getAttribute('aria-expanded')).toBe('true');
    expect(header(/OPS/).getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps a level the player closed closed across re-renders on the same node', () => {
    const id = nodeOn(1).id;
    const { rerender } = render(<MapModal gameState={discoverAll(id)} />);
    fireEvent.click(header(/OPS/));
    expect(header(/OPS/).getAttribute('aria-expanded')).toBe('false');
    rerender(<MapModal gameState={discoverAll(id)} />);
    expect(header(/OPS/).getAttribute('aria-expanded')).toBe('false');
  });

  it('restores the levels the player left open when the map is mounted again', () => {
    const state = discoverAll(nodeOn(1).id);
    const first = render(<MapModal gameState={state} />);
    fireEvent.click(header(/SECURITY/));
    fireEvent.click(header(/OPS/));
    first.unmount();
    render(<MapModal gameState={state} />);
    expect(header(/SECURITY/).getAttribute('aria-expanded')).toBe('true');
    // the current node's level is always open again after a restore
    expect(header(/OPS/).getAttribute('aria-expanded')).toBe('true');
    expect(header(/FINANCE/).getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores garbage in sessionStorage', () => {
    sessionStorage.setItem('irongate_map_levels', '{"x":[9,"a",null]');
    render(<MapModal gameState={discoverAll(nodeOn(1).id)} />);
    expect(header(/OPS/).getAttribute('aria-expanded')).toBe('true');
    expect(header(/SECURITY/).getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores values that are not a list of layers', () => {
    sessionStorage.setItem('irongate_map_levels', JSON.stringify([2, 'x', 99, 1.5, null]));
    render(<MapModal gameState={discoverAll(nodeOn(1).id)} />);
    expect(header(/SECURITY/).getAttribute('aria-expanded')).toBe('true');
    expect(header(/FINANCE/).getAttribute('aria-expanded')).toBe('false');
  });

  it('renders and toggles when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<MapModal gameState={discoverAll(nodeOn(1).id)} />);
    expect(header(/OPS/).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(header(/SECURITY/));
    expect(header(/SECURITY/).getAttribute('aria-expanded')).toBe('true');
  });
});
