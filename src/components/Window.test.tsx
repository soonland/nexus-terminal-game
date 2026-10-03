// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Window } from './Window';
import type { WindowInstance } from '../engine/windowManager';

const baseInstance: WindowInstance = {
  kind: 'map',
  x: 100,
  y: 80,
  width: 400,
  height: 300,
  zIndex: 1,
  open: true,
  minimized: false,
};

const renderWindow = (overrides: Partial<Parameters<typeof Window>[0]> = {}) => {
  const props = {
    instance: baseInstance,
    title: 'NETWORK MAP',
    accentColor: '#55ffaa',
    closable: true,
    minimizable: true,
    onFocus: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
    onMinimize: vi.fn(),
    onToggleMaximize: vi.fn(),
    onClose: vi.fn(),
    children: <div>content</div>,
    ...overrides,
  };
  render(<Window {...props} />);
  return props;
};

describe('Window', () => {
  it('renders its title and children', () => {
    renderWindow();
    expect(screen.getByText('NETWORK MAP')).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('calls onFocus when clicked anywhere in the window', () => {
    const props = renderWindow();
    fireEvent.pointerDown(screen.getByText('content'));
    expect(props.onFocus).toHaveBeenCalled();
  });

  it('hides the minimize/close buttons when not closable/minimizable', () => {
    renderWindow({ closable: false, minimizable: false });
    expect(screen.queryByLabelText('Minimize NETWORK MAP')).toBeNull();
    expect(screen.queryByLabelText('Close NETWORK MAP')).toBeNull();
  });

  it('calls onMinimize / onClose from their buttons', () => {
    const props = renderWindow();
    fireEvent.click(screen.getByLabelText('Minimize NETWORK MAP'));
    fireEvent.click(screen.getByLabelText('Close NETWORK MAP'));
    expect(props.onMinimize).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('dragging the title bar calls onMove with the dragged delta', () => {
    const props = renderWindow();
    const titlebar = screen.getByTestId('window-titlebar');
    fireEvent.pointerDown(titlebar, { clientX: 50, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 70, clientY: 65 });
    expect(props.onMove).toHaveBeenCalledWith(120, 105); // origin (100,80) + delta (20,25)
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
    expect(props.onMove).toHaveBeenCalledTimes(1); // stopped listening after pointerup
  });

  it('dragging the resize handle calls onResize with the dragged delta', () => {
    const props = renderWindow();
    const handle = screen.getByTestId('window-resize-handle');
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 380 });
    fireEvent.pointerMove(window, { clientX: 560, clientY: 410 });
    expect(props.onResize).toHaveBeenCalledWith(460, 330); // origin (400,300) + delta (60,30)
  });

  it('renders the same window-body class for every window kind, including the terminal', () => {
    renderWindow(); // baseInstance.kind is 'map'
    const mapBody = screen.getByText('content').closest('.window-body');
    expect(mapBody?.className).toBe('window-body');

    renderWindow({ instance: { ...baseInstance, kind: 'terminal' } });
    const terminalBody = screen.getAllByText('content')[1].closest('.window-body');
    expect(terminalBody?.className).toBe('window-body');
  });

  it('toggles maximize from the button and a title bar double-click', () => {
    const props = renderWindow();
    fireEvent.click(screen.getByLabelText('Maximize NETWORK MAP'));
    expect(props.onToggleMaximize).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(screen.getByTestId('window-titlebar'));
    expect(props.onToggleMaximize).toHaveBeenCalledTimes(2);
  });

  it('shows Restore and hides the resize handle while maximized', () => {
    renderWindow({ instance: { ...baseInstance, maximized: true } });
    expect(screen.getByLabelText('Restore NETWORK MAP')).toBeTruthy();
    expect(screen.queryByTestId('window-resize-handle')).toBeNull();
  });
});
