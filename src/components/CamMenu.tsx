import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { FLOORS, floorAccent, floorName } from '../data/cameras';
import type { ListedFeed } from '../engine/cameras';

interface Props {
  feeds: readonly ListedFeed[];
  selectedId: string;
  onSelect: (id: string) => void;
}

// Floors that have at least one listed camera, in the building's order.
const floorsWithFeeds = (feeds: readonly ListedFeed[]) =>
  FLOORS.flatMap(floor => {
    const own = feeds.filter(f => f.floor === floor.id);
    return own.length > 0 ? [{ ...floor, feeds: own }] : [];
  });

// A cascading menu: floors in one column, and the active floor's cameras in a second column beside
// it. Hover or focus a floor to see its cameras; ArrowRight / click moves into them, ArrowLeft /
// Escape comes back, and a second Escape closes the menu.
export const CamMenu = ({ feeds, selectedId, onSelect }: Props) => {
  const selected = feeds.find(f => f.id === selectedId);
  const [open, setOpen] = useState(false);
  // The floor whose cameras are showing in the second column.
  const [active, setActive] = useState<string | null>(null);
  const [enterCameras, setEnterCameras] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const floors = floorsWithFeeds(feeds);
  const activeFloor = floors.find(f => f.id === active);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  // Move focus into the cameras once their column has rendered.
  useEffect(() => {
    if (!enterCameras) return;
    rootRef.current
      ?.querySelector<HTMLElement>('[data-column="cameras"] [data-menu-item]')
      ?.focus();
    setEnterCameras(false);
  }, [enterCameras, active]);

  // Closing from inside the menu (Escape, choosing a camera) hands focus back to the opener, so the
  // keyboard user is not dropped at the top of the page. A click outside leaves focus where it went.
  const closeToOpener = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const toggleMenu = () => {
    if (!open) setActive(selected?.floor ?? null);
    setOpen(!open);
  };

  const openFloor = (id: string, focusCameras: boolean) => {
    setActive(id);
    if (focusCameras) setEnterCameras(true);
  };

  const focusFloor = () => {
    rootRef.current?.querySelector<HTMLElement>(`[data-floor-id="${active ?? ''}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const inCameras = target.closest('[data-column="cameras"]') !== null;
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (inCameras) focusFloor();
      else closeToOpener();
      return;
    }
    if (event.key === 'ArrowLeft' && inCameras) {
      event.preventDefault();
      focusFloor();
      return;
    }
    if (event.key === 'ArrowRight' && target.dataset['floorId']) {
      event.preventDefault();
      openFloor(target.dataset['floorId'], true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const column = inCameras ? 'cameras' : 'floors';
    const items = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(
        `[data-column="${column}"] [data-menu-item]`,
      ) ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(target);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  const label = selected ? `${floorName(selected.floor)} › ${selected.name}` : 'CAMERAS';

  return (
    <div className="cam-menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={buttonRef}
        className="cam-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleMenu}>
        {`${label} ▾`}
      </button>
      {open && (
        <div className="cam-menu-popover" role="menu">
          <div className="cam-menu-floors" data-column="floors">
            {floors.map(floor => (
              <button
                key={floor.id}
                type="button"
                role="menuitem"
                data-menu-item
                data-floor-id={floor.id}
                className={
                  floor.id === active ? 'cam-menu-floor cam-menu-active' : 'cam-menu-floor'
                }
                aria-haspopup="menu"
                aria-expanded={floor.id === active}
                onMouseEnter={() => {
                  openFloor(floor.id, false);
                }}
                onClick={() => {
                  openFloor(floor.id, true);
                }}>
                <span
                  className="cam-menu-swatch"
                  style={{ background: `#${floorAccent(floor.id).toString(16).padStart(6, '0')}` }}
                />
                {`${floor.name.toUpperCase()} ▸`}
              </button>
            ))}
          </div>
          {activeFloor && (
            <div
              className="cam-menu-cameras"
              role="group"
              aria-label={activeFloor.name}
              data-column="cameras">
              {activeFloor.feeds.map(feed => (
                <button
                  key={feed.id}
                  type="button"
                  role="menuitemradio"
                  data-menu-item
                  aria-checked={feed.id === selectedId}
                  className={feed.live ? 'cam-menu-item' : 'cam-menu-item cam-menu-off'}
                  onClick={() => {
                    onSelect(feed.id);
                    closeToOpener();
                  }}>
                  {feed.live ? feed.name : `${feed.name} — ${feed.locked ? 'locked' : 'offline'}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
