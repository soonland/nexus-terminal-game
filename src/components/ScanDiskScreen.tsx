import { useState, useEffect } from 'react';

const COLS = 54;
const ROWS = 8;
const TOTAL = COLS * ROWS;

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

const TITLE_TEXT = 'NEXUS SECURE UPLINK INITIALIZER v3.1';

const cellColor = (state: CellState): string => {
  if (state === 1) return 'var(--color-system)'; // yellow — active
  if (state === 2) return 'var(--color-safe)'; // green — done
  if (state === 3) return 'var(--color-error)'; // red — error
  return 'var(--win-border)'; // idle
};

export const ScanDiskScreen = ({ onDone }: Props) => {
  const [cells, setCells] = useState<CellState[]>(() => Array.from({ length: TOTAL }, () => 0));
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

  const statusText = STATUS_STEPS[statusIdx] ?? '';

  return (
    <div
      className="desktop"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <div
        className="window"
        style={{ position: 'relative', width: 620, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <div className="window-titlebar">
          <span className="window-title">{TITLE_TEXT}</span>
        </div>

        <div
          className="window-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Packet routing grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${String(COLS)}, 1fr)`,
              gap: '2px',
            }}>
            {cells.map((state, idx) => (
              <div key={idx} style={{ aspectRatio: '1', background: cellColor(state) }} />
            ))}
          </div>

          {/* Progress bar */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.25rem',
                color: 'var(--color-output)',
              }}>
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div
              style={{
                height: '10px',
                background: 'var(--win-border)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
              <div
                style={{
                  height: '100%',
                  width: `${String(progress)}%`,
                  background: 'var(--color-system)',
                  transition: 'width 120ms linear',
                }}
              />
            </div>
          </div>

          <div style={{ color: 'var(--color-output)' }}>Status: {statusText}</div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: 'var(--color-system)',
            }}>
            <span>Packets: {packets}</span>
            <span>Hops: {hops} (anonymized)</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: 'var(--color-system)',
            }}>
            <span>Latency: {latency} ms</span>
            <span>Cipher: AES-256-GCM</span>
          </div>

          <div
            style={{
              textAlign: 'center',
              marginTop: '0.5rem',
              color: ready ? 'var(--color-system)' : 'transparent',
            }}>
            Press Enter to continue...
          </div>
        </div>
      </div>
    </div>
  );
};
