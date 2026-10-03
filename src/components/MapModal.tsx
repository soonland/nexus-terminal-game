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

  const discovered = Object.values(nodes).filter(
    (n): n is NonNullable<typeof n> => !!n && n.discovered,
  );

  type MapLine = { text: string; color: string };
  const body: MapLine[] = [{ text: r(), color: 'var(--color-system)' }];

  [0, 1, 2, 3, 4, 5].forEach(layer => {
    const layerNodes = discovered.filter(n => n.layer === layer);
    if (layerNodes.length === 0) return;
    body.push({
      text: r(`[L${String(layer)}] ${LAYER_LABELS[layer] ?? ''}`),
      color: 'var(--color-output)',
    });
    layerNodes.forEach(n => {
      const current = n.id === currentNodeId ? ' ◄' : '';
      const access = n.accessLevel !== 'none' ? ` [${n.accessLevel.toUpperCase()}]` : '';
      const compromised = n.compromised ? ' !' : '';
      const patched = n.sentinelPatched ? ' [PATCHED]' : '';
      body.push({
        text: r(`    ${n.ip}  ${n.label}${access}${compromised}${patched}${current}`),
        color: n.id === currentNodeId ? 'var(--color-output)' : 'var(--color-system)',
      });
    });
    body.push({ text: r(), color: 'var(--color-system)' });
  });

  const legend: MapLine[] = [
    { text: r('LEGEND'), color: 'var(--color-output)' },
    { text: r('  ◄  current node    !  compromised'), color: 'var(--color-system)' },
    { text: r('  [PATCHED]  exploit cost +1 (sentinel)'), color: 'var(--color-system)' },
    { text: r(), color: 'var(--color-system)' },
  ];

  return (
    <>
      {[...body, ...legend].map((line, i) => (
        <div key={i} style={{ ...mono, color: line.color }}>
          {line.text}
        </div>
      ))}
    </>
  );
};
