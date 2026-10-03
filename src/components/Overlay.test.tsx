// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Overlay } from './Overlay';

const setup = () => {
  const onClose = vi.fn();
  render(
    <Overlay title="COMMAND REFERENCE" onClose={onClose}>
      <div>overlay-body</div>
    </Overlay>,
  );
  return { onClose };
};

describe('Overlay', () => {
  it('renders an accessible dialog with its title and body', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'COMMAND REFERENCE' })).toBeTruthy();
    expect(screen.getByText('overlay-body')).toBeTruthy();
  });

  it('focuses the close button on open', () => {
    setup();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close COMMAND REFERENCE' }),
    );
  });

  it('closes on Escape, on the close button and on backdrop click', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close COMMAND REFERENCE' }));
    fireEvent.click(document.querySelector('.overlay-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close when the dialog body is clicked', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('overlay-body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps focus on the close button when Tab is pressed', () => {
    setup();
    const close = screen.getByRole('button', { name: 'Close COMMAND REFERENCE' });
    close.blur();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  it('ignores other keys', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
