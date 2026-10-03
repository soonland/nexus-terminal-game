// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Taskbar } from './Taskbar';
import {
  createDefaultLayout,
  openWindow,
  minimizeWindow,
  WINDOW_KINDS,
} from '../engine/windowManager';
import type { WindowKind } from '../engine/windowManager';

const TITLES: Record<WindowKind, string> = {
  terminal: 'TERMINAL',
  map: 'NETWORK MAP',
  notes: 'OPERATIVE NOTES',
  help: 'COMMAND REFERENCE',
  briefing: 'OPERATIVE ACTIVATION NOTICE',
  dossier: 'DOSSIER',
  explorer: 'FILE EXPLORER',
};

const VIEWPORT = { width: 1280, height: 800 };

describe('Taskbar', () => {
  it('renders one entry per window kind', () => {
    const state = createDefaultLayout(VIEWPORT);
    render(<Taskbar state={state} titles={TITLES} onEntryClick={vi.fn()} />);
    for (const kind of WINDOW_KINDS) {
      expect(screen.getByText(TITLES[kind])).toBeTruthy();
    }
  });

  it('calls onEntryClick with the clicked kind', () => {
    const state = createDefaultLayout(VIEWPORT);
    const onEntryClick = vi.fn();
    render(<Taskbar state={state} titles={TITLES} onEntryClick={onEntryClick} />);
    fireEvent.click(screen.getByText('NETWORK MAP'));
    expect(onEntryClick).toHaveBeenCalledWith('map');
  });

  it('distinguishes open/focused, minimized, and closed via data-state', () => {
    let state = createDefaultLayout(VIEWPORT);
    state = openWindow(state, 'map'); // open+focused
    state = openWindow(state, 'notes');
    state = minimizeWindow(state, 'notes'); // minimized
    // 'help' stays closed
    render(<Taskbar state={state} titles={TITLES} onEntryClick={vi.fn()} />);
    expect(screen.getByText('NETWORK MAP').getAttribute('data-state')).toBe('focused');
    expect(screen.getByText('OPERATIVE NOTES').getAttribute('data-state')).toBe('minimized');
    expect(screen.getByText('COMMAND REFERENCE').getAttribute('data-state')).toBe('closed');
  });
});
