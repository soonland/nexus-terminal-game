import { useState, useEffect } from 'react';

const COLS = 54;
const ROWS = 8;
const TOTAL = COLS * ROWS;
const IW = 56;
const BAR_WIDTH = 35;

const STATUS_STEPS = [
  'Initializing secure channel...',
  'Generating ephemeral keypair...',
  'Performing Diffie-Hellman exchange...',
  'Negotiating cipher suite: AES-256-GCM...',
  'Establishing TLS 1.3 tunnel...',
  'Routing through anonymization nodes...',
  'Injecting decoy traffic streams...',
  'Verifying certificate chain...',
  'Obfuscating connection fingerprint...',
  'Synchronizing keepalive heartbeat...',
  'Compressing payload headers...',
  'NEXUS uplink confirmed. Routing active.',
];

type CellState = 0 | 1 | 2 | 3; // idle | active | done | error

interface Props {
  onDone: () => void;
}

const mono = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size)',
  lineHeight: 'var(--line-height)',
  whiteSpace: 'pre' as const,
  display: 'flex' as const,
  margin: 0,
};

const row = (s = '') => `║ ${s.padEnd(IW - 1)}║`;

const titleText = 'NEXUS SECURE UPLINK INITIALIZER v3.1';
const titleFill = IW - titleText.length;
const TOP = `╔${'═'.repeat(Math.floor(titleFill / 2))}${titleText}${'═'.repeat(Math.ceil(titleFill / 2))}╗`;
const MID = `╠${'═'.repeat(IW)}╣`;
const BOT = `╚${'═'.repeat(IW)}╝`;

const cellColor = (state: CellState): string => {
  if (state === 1) return 'var(--color-system)'; // yellow — active
  if (state === 2) return '#55ff55'; // green — done
  if (state === 3) return 'var(--color-error)'; // red — error
  return '#001177'; // dark — idle
};

export const ScanDiskScreen = ({ onDone }: Props) => {
  const [cells, setCells] = useState<CellState[]>(() =>
    Array.from({ length: TOTAL }, () => 0 as CellState),
  );
  const [progress, setProgress] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [packets, setPackets] = useState(0);
  const [latency, setLatency] = useState(12);
  const [hops, setHops] = useState(4);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [ready, onDone]);

  useEffect(() => {
    let current = 0;
    let done = false;
    let timerId: ReturnType<typeof setTimeout>;

    const nextDelay = (): number => {
      const r = Math.random();
      if (r < 0.03) return 1200 + Math.random() * 1800; // rare stall
      if (r < 0.12) return 200 + Math.random() * 400; // occasional slowdown
      return 20 + Math.random() * 30; // normal fast
    };

    const tick = () => {
      if (current >= TOTAL) {
        if (!done) {
          done = true;
          setReady(true);
        }
        return;
      }

      const BATCH = 3;
      const end = Math.min(current + BATCH, TOTAL);

      const errorSet = new Set<number>();
      for (let i = current; i < end; i++) {
        if (Math.random() < 0.04) errorSet.add(i);
      }

      setCells(prev => {
        const next = [...prev] as CellState[];
        for (let i = current; i < end; i++) {
          next[i] = errorSet.has(i) ? 3 : 2;
        }
        if (end < TOTAL) next[end] = 1;
        return next;
      });

      errorSet.forEach(idx => {
        setTimeout(
          () => {
            setCells(prev => {
              const fixed = [...prev] as CellState[];
              fixed[idx] = 2;
              return fixed;
            });
          },
          300 + Math.random() * 300,
        );
      });

      current = end;

      const pct = Math.min(100, Math.round((current / TOTAL) * 100));
      setProgress(pct);
      setPackets(p => p + BATCH * 4 + Math.floor(Math.random() * 12));
      if (Math.random() < 0.25) setLatency(Math.floor(8 + Math.random() * 28));
      if (Math.random() < 0.08) setHops(Math.floor(4 + Math.random() * 5));

      const step = Math.min(
        STATUS_STEPS.length - 1,
        Math.floor((current / TOTAL) * STATUS_STEPS.length),
      );
      setStatusIdx(step);

      timerId = setTimeout(tick, nextDelay());
    };

    timerId = setTimeout(tick, nextDelay());

    return () => {
      clearTimeout(timerId);
    };
  }, [onDone]);

  const filled = Math.floor((progress / 100) * BAR_WIDTH);
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
  const statusText = STATUS_STEPS[statusIdx] ?? '';

  const progressRow = row(`  Progress : [${bar}] ${String(progress).padStart(3)}%`);
  const statusRow = row(`  Status   : ${statusText}`);
  const packetsRow = row(
    `  Packets  : ${String(packets).padStart(7)}   Hops : ${String(hops)}  (anonymized)`,
  );
  const latencyRow = row(`  Latency  : ${String(latency).padStart(4)} ms    Cipher : AES-256-GCM`);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <div style={{ position: 'relative' }}>
        {/* Drop shadow */}
        <div
          style={{
            position: 'absolute',
            top: 5,
            left: 5,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.7)',
          }}
        />
        {/* Dialog box */}
        <div style={{ position: 'relative', background: 'var(--color-bg)' }}>
          <div style={{ ...mono, color: 'var(--color-border)' }}>{TOP}</div>
          <div style={{ ...mono, color: 'var(--color-output)' }}>{row()}</div>

          {/* Packet routing grid */}
          {Array.from({ length: ROWS }, (_, rowIdx) => (
            <div key={rowIdx} style={mono}>
              <span style={{ color: 'var(--color-border)' }}>{'║ '}</span>
              {Array.from({ length: COLS }, (_, colIdx) => {
                const idx = rowIdx * COLS + colIdx;
                const state = cells[idx] ?? 0;
                return (
                  <span key={colIdx} style={{ color: cellColor(state) }}>
                    {'█'}
                  </span>
                );
              })}
              <span style={{ color: 'var(--color-border)' }}>{' ║'}</span>
            </div>
          ))}

          <div style={{ ...mono, color: 'var(--color-output)' }}>{row()}</div>
          <div style={{ ...mono, color: 'var(--color-border)' }}>{MID}</div>
          <div style={{ ...mono, color: 'var(--color-output)' }}>{row()}</div>
          <div style={{ ...mono, color: 'var(--color-output)' }}>{progressRow}</div>
          <div style={{ ...mono, color: 'var(--color-output)' }}>{statusRow}</div>
          <div style={{ ...mono, color: 'var(--color-output)' }}>{row()}</div>
          <div style={{ ...mono, color: 'var(--color-system)' }}>{packetsRow}</div>
          <div style={{ ...mono, color: 'var(--color-system)' }}>{latencyRow}</div>
          <div style={{ ...mono, color: ready ? 'var(--color-system)' : 'var(--color-bg)' }}>
            {row('  Press Enter to continue...')}
          </div>
          <div style={{ ...mono, color: 'var(--color-border)' }}>{BOT}</div>
        </div>
      </div>
    </div>
  );
};
