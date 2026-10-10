import { useEffect, useState } from 'react';
import type { GameState } from '../types/game';

interface Props {
  gameState: GameState;
}

// Used to wrap every line in `║ ... ║` box-drawing characters (DosModal-era);
// kept as the single call site for line text so it's easy to reintroduce
// per-line formatting later without touching every line below.
const r = (s = '') => s;

const LAYER_LABELS = ['ENTRY', 'OPS', 'SECURITY', 'FINANCE', 'EXECUTIVE', 'CASSANDRA'];

const mono = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-secondary)',
  lineHeight: 'var(--line-height)',
  whiteSpace: 'pre' as const,
  display: 'block' as const,
  margin: 0,
};

export const MapModal = ({ gameState }: Props) => {
  const { nodes, currentNodeId } = gameState.network;

  // Levels the player has opened or closed. The current node's level starts open and opens
  // again whenever the player moves onto another level; levels opened by hand stay open.
  const currentLayer = nodes[currentNodeId]?.layer;
  const [open, setOpen] = useState<Record<number, boolean>>(() =>
    currentLayer === undefined ? {} : { [currentLayer]: true },
  );
  useEffect(() => {
    if (currentLayer === undefined) return;
    setOpen(prev => ({ ...prev, [currentLayer]: true }));
  }, [currentLayer]);
  const toggle = (layer: number) => {
    setOpen(prev => ({ ...prev, [layer]: !(prev[layer] ?? false) }));
  };

  const discovered = Object.values(nodes).filter(
    (n): n is NonNullable<typeof n> => !!n && n.discovered,
  );

  type MapLine = { text: string; color: string };
  const nodeLine = (n: (typeof discovered)[number]): MapLine => {
    const current = n.id === currentNodeId ? ' ◄' : '';
    const access = n.accessLevel !== 'none' ? ` [${n.accessLevel.toUpperCase()}]` : '';
    const compromised = n.compromised ? ' !' : '';
    const patched = n.sentinelPatched ? ' [PATCHED]' : '';
    return {
      text: r(`    ${n.ip}  ${n.label}${access}${compromised}${patched}${current}`),
      color: n.id === currentNodeId ? 'var(--color-output)' : 'var(--color-system)',
    };
  };
  const blank: MapLine = { text: r(), color: 'var(--color-system)' };

  const legend: MapLine[] = [
    { text: r('LEGEND'), color: 'var(--color-output)' },
    { text: r('  ◄  current node    !  compromised'), color: 'var(--color-system)' },
    { text: r('  [PATCHED]  exploit cost +1 (sentinel)'), color: 'var(--color-system)' },
    { text: r(), color: 'var(--color-system)' },
  ];

  const renderLine = (line: MapLine, key: string) => (
    <div key={key} style={{ ...mono, color: line.color }}>
      {line.text}
    </div>
  );

  return (
    <>
      {renderLine(blank, 'top')}
      {[0, 1, 2, 3, 4, 5].map(layer => {
        const layerNodes = discovered.filter(n => n.layer === layer);
        if (layerNodes.length === 0) return null;
        const isOpen = open[layer] ?? false;
        return (
          <section key={layer} data-testid={`map-level-${String(layer)}`}>
            <button
              type="button"
              className="case-section-title"
              aria-expanded={isOpen}
              onClick={() => {
                toggle(layer);
              }}>
              <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              {` [L${String(layer)}] ${LAYER_LABELS[layer] ?? ''}`}
            </button>
            {isOpen && layerNodes.map(n => renderLine(nodeLine(n), n.id))}
            {renderLine(blank, 'gap')}
          </section>
        );
      })}
      {legend.map((line, i) => renderLine(line, `legend-${String(i)}`))}
    </>
  );
};
