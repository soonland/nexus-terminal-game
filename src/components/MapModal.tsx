import type { GameState } from '../types/game';
import { DosModal } from './DosModal';
import { boxRow } from './dosModalHelpers';

interface Props {
  gameState: GameState;
  onClose: () => void;
}

const IW = 58;
const r = (s = '') => boxRow(IW, s);

const LAYER_LABELS = ['ENTRY', 'OPS', 'SECURITY', 'FINANCE', 'EXECUTIVE', 'ARIA'];

const mono = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size)',
  lineHeight: 'var(--line-height)',
  whiteSpace: 'pre' as const,
  display: 'block' as const,
  margin: 0,
};

export const MapModal = ({ gameState, onClose }: Props) => {
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
      body.push({
        text: r(`    ${n.ip}  ${n.label}${access}${current}`),
        color: n.id === currentNodeId ? 'var(--color-output)' : 'var(--color-system)',
      });
    });
    body.push({ text: r(), color: 'var(--color-system)' });
  });

  return (
    <DosModal title=" NETWORK MAP " innerWidth={IW} onClose={onClose}>
      {body.map((line, i) => (
        <div key={i} style={{ ...mono, color: line.color }}>
          {line.text}
        </div>
      ))}
    </DosModal>
  );
};
