import type { GameState } from '../types/game';
import { DosModal } from './DosModal';
import { boxRow } from './dosModalHelpers';

interface Props {
  gameState: GameState;
  onClose: () => void;
}

const IW = 58;
const r = (s = '') => boxRow(IW, s);

const mono = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size)',
  lineHeight: 'var(--line-height)',
  whiteSpace: 'pre' as const,
  display: 'block' as const,
  margin: 0,
};

type NoteLine = { text: string; color: string };

export const NotesModal = ({ gameState, onClose }: Props) => {
  const { player, network } = gameState;

  const body: NoteLine[] = [];

  // ── Credentials ──────────────────────────────────────────
  body.push({ text: r(), color: 'var(--color-system)' });
  body.push({ text: r('CREDENTIALS'), color: 'var(--color-output)' });

  const obtained = player.credentials.filter(c => c.obtained);
  if (obtained.length === 0) {
    body.push({ text: r('  -- none --'), color: 'var(--color-system)' });
  } else {
    obtained.forEach(c => {
      const tag = `[${c.accessLevel.toUpperCase()}]`;
      const label = `  ${c.username}`;
      const padding = IW - 2 - label.length - tag.length;
      body.push({
        text: r(`${label}${' '.repeat(Math.max(1, padding))}${tag}`),
        color: 'var(--color-system)',
      });
    });
  }

  // ── Discovered nodes ──────────────────────────────────────
  body.push({ text: r(), color: 'var(--color-system)' });
  body.push({ text: r('DISCOVERED NODES'), color: 'var(--color-output)' });

  const discovered = Object.values(network.nodes).filter(
    (n): n is NonNullable<typeof n> => !!n && n.discovered,
  );
  if (discovered.length === 0) {
    body.push({ text: r('  -- none --'), color: 'var(--color-system)' });
  } else {
    discovered.forEach(n => {
      const isCurrent = n.id === network.currentNodeId;
      const access = n.accessLevel !== 'none' ? ` [${n.accessLevel.toUpperCase()}]` : '';
      const flag = n.compromised ? ' !' : '';
      const suffix = `${access}${flag}`;
      const label = `  ${n.ip}  ${n.label}`;
      const padding = IW - 2 - label.length - suffix.length;
      body.push({
        text: r(`${label}${' '.repeat(Math.max(1, padding))}${suffix}`),
        color: isCurrent ? 'var(--color-output)' : 'var(--color-system)',
      });
    });
  }

  // ── Exfiltrated files ─────────────────────────────────────
  body.push({ text: r(), color: 'var(--color-system)' });
  body.push({ text: r('EXFILTRATED FILES'), color: 'var(--color-output)' });

  if (player.exfiltrated.length === 0) {
    body.push({ text: r('  -- none --'), color: 'var(--color-system)' });
  } else {
    player.exfiltrated.forEach(f => {
      body.push({ text: r(`  ${f.path}`), color: 'var(--color-system)' });
    });
  }

  body.push({ text: r(), color: 'var(--color-system)' });

  return (
    <DosModal title=" OPERATIVE NOTES " innerWidth={IW} onClose={onClose}>
      {body.map((line, i) => (
        <div key={i} style={{ ...mono, color: line.color }}>
          {line.text}
        </div>
      ))}
    </DosModal>
  );
};
