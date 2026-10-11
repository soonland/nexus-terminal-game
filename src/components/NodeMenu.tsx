import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { NodeAction } from '../engine/mapActions';

interface Props {
  actions: NodeAction[];
  lockReason: string | null;
  left: number;
  top: number;
  onRun: (command: string) => void;
  onClose: () => void;
}

export const NodeMenu = ({ actions, lockReason, left, top, onRun, onClose }: Props) => {
  const [confirming, setConfirming] = useState<NodeAction | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const items = (): HTMLElement[] =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // The list opens on its first entry; the confirm view opens on Cancel, so a stray Enter spends
  // nothing.
  useEffect(() => {
    const all = items();
    (confirming ? all[all.length - 1] : all[0]).focus();
  }, [confirming]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (confirming) setConfirming(null);
      else onClose();
      return;
    }
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? (at + 1) % all.length
        : e.key === 'ArrowUp'
          ? (at - 1 + all.length) % all.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? all.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    e.stopPropagation();
    all[next].focus();
  };

  const choose = (a: NodeAction) => {
    if (a.confirm) setConfirming(a);
    else onRun(a.command);
  };

  return (
    <div
      ref={ref}
      className="node-menu"
      role="menu"
      aria-label="Node actions"
      style={{ left, top }}
      onKeyDown={onKeyDown}>
      {lockReason && (
        <div className="node-menu-note" role="note">
          {lockReason}
        </div>
      )}
      {confirming ? (
        <>
          <div className="node-menu-confirm">
            {confirming.label}
            {confirming.cost ? ` — ${confirming.cost}` : ''}
          </div>
          <button
            type="button"
            role="menuitem"
            className="node-menu-item"
            aria-disabled={lockReason !== null}
            onClick={() => {
              if (lockReason === null) onRun(confirming.command);
            }}>
            Run
          </button>
          <button
            type="button"
            role="menuitem"
            className="node-menu-item"
            onClick={() => {
              setConfirming(null);
            }}>
            Cancel
          </button>
        </>
      ) : actions.length === 0 ? (
        <button type="button" role="menuitem" className="node-menu-item" aria-disabled="true">
          No actions available
        </button>
      ) : (
        actions.map(a => {
          const blocked = lockReason !== null || a.disabledReason !== null || a.command === '';
          return (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              className="node-menu-item"
              aria-disabled={blocked}
              data-action-id={a.id}
              onClick={() => {
                if (!blocked) choose(a);
              }}>
              <span className="node-menu-label">{a.label}</span>
              {a.cost && <span className="node-menu-cost">{a.cost}</span>}
              {a.disabledReason && <span className="node-menu-reason">{a.disabledReason}</span>}
            </button>
          );
        })
      )}
    </div>
  );
};
