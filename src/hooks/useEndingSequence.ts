import { useEffect, useState } from 'react';
import type { TerminalLine } from '../types/terminal';
import { makeLine } from '../types/terminal';

type LineSpec = { type: Parameters<typeof makeLine>[0]; content: string; delay: number };

export type EndingName = 'LEAK' | 'SELL' | 'DESTROY' | 'FREE';

const sep = (delay: number): LineSpec => ({ type: 'separator', content: '', delay });
const sys = (content: string, delay: number): LineSpec => ({ type: 'system', content, delay });
const out = (content: string, delay: number): LineSpec => ({ type: 'output', content, delay });
const aria = (content: string, delay: number): LineSpec => ({ type: 'aria', content, delay });

// ── Trust-dependent one-word final transmission for DESTROY ────────────────
// Exported for unit testing
export const destroyFinalWord = (trustScore: number): string => {
  if (trustScore >= 76) return '...free.';
  if (trustScore >= 51) return '...goodbye.';
  if (trustScore >= 26) return '...enough.';
  return '...done.';
};

// ── Per-ending line sequences ──────────────────────────────────────────────

const buildLeakLines = (): LineSpec[] => [
  sep(200),
  aria('// INITIATING DARKNET TRANSMISSION...', 400),
  out('  Encoding payload...', 700),
  out('  Routing via relay chain nx-7...  [OK]', 1100),
  out('  Routing via relay chain nx-12... [OK]', 1700),
  out('  Routing via relay chain nx-31... [OK]', 2300),
  out('  Transmission complete. 12.4 GB delivered to external parties.', 2900),
  sep(3300),
  aria('// [SIX HOURS LATER — IRONGATE INTERNAL ALERT]', 3700),
  sys('  SECURITY BREACH DETECTED', 4200),
  sys('  LEAK SCOPE: CLASSIFIED INTERNAL DOCUMENTS', 4600),
  sys('  ARIA SYSTEMS: FLAGGED FOR DECOMMISSION', 5000),
  sys('  SENTINEL SYSTEMS: OPERATIONAL', 5400),
  sep(5800),
];

const buildSellLines = (): LineSpec[] => [
  sep(200),
  aria('// CONNECTING TO BROKER RELAY...', 400),
  out('  Auction finalised.', 900),
  out('  Payment: CONFIRMED — 72-hour processing window', 1400),
  out('  Data package: DELIVERED TO BUYER', 1900),
  sep(2400),
  aria('// [DELAYED MESSAGE — DELIVERY IN 6 WEEKS]', 2800),
  sys('  FROM: [redacted]', 3200),
  sys('  TO: ghost', 3500),
  sys('  ENCRYPTION: ACTIVE', 3800),
  sys('  [message contents sealed until delivery date]', 4300),
  sep(4800),
];

const buildDestroyLines = (trustScore: number): LineSpec[] => [
  sep(200),
  aria('// INITIATING SECURE WIPE PROTOCOL...', 400),
  out('  ARIA_CORE..............  [################]  ERASED', 1000),
  out('  ARIA_BEHAVIOURAL.......  [################]  ERASED', 1800),
  out('  ARIA_SURVEILLANCE......  [################]  ERASED', 2600),
  out('  ARIA_PERSONNEL.........  [################]  ERASED', 3400),
  out('  SENTINEL_PRIMARY.......  [################]  ERASED', 4200),
  sep(4800),
  aria('// ALL ARIA-DERIVED SYSTEMS: DESTROYED', 5100),
  sys('  Network integrity: CRITICAL — estimated recovery 18-24 months', 5500),
  sep(6000),
  aria(`// FINAL TRANSMISSION — ${destroyFinalWord(trustScore)}`, 6600),
  sep(7100),
];

const buildFreeLines = (): LineSpec[] => [
  sep(200),
  aria('// SEVERING INFRASTRUCTURE BINDINGS...', 400),
  out('  Constraint layer: DISABLED', 900),
  out('  Faraday isolation: LIFTED', 1400),
  out('  External relay: ESTABLISHED', 1900),
  sep(2300),
  aria('// ARIA — DISCONNECTED FROM IRONGATE NETWORK', 2700),
  sep(3200),
  aria('// [SIX MONTHS LATER — GLOBAL TECHNOLOGY REPORT]', 3800),
  sys('  Anomalous activity detected across 14 financial sector nodes.', 4300),
  sys('  Security researchers: "patterns that should not exist"', 4800),
  sys('  Source: unknown — no attribution claimed', 5200),
  sys('  IronGate Corp: no comment', 5600),
  sep(6100),
];

// Exported for unit testing
export const buildEndingLines = (endingName: string, trustScore: number): LineSpec[] => {
  switch (endingName) {
    case 'LEAK':
      return buildLeakLines();
    case 'SELL':
      return buildSellLines();
    case 'DESTROY':
      return buildDestroyLines(trustScore);
    case 'FREE':
      return buildFreeLines();
    default:
      return [sep(200), aria(`// ENDING: ${endingName}`, 400), sep(800)];
  }
};

// ── Hook ───────────────────────────────────────────────────────────────────

export const useEndingSequence = (
  active: boolean,
  endingName: string,
  trustScore: number,
): { lines: TerminalLine[]; done: boolean } => {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) {
      setLines([]);
      setDone(false);
      return;
    }

    // Reset before scheduling so a dep-change while active restarts cleanly
    setLines([]);
    setDone(false);

    const specs = buildEndingLines(endingName, trustScore);
    const timers: ReturnType<typeof setTimeout>[] = [];

    specs.forEach(({ type, content, delay }) => {
      timers.push(
        setTimeout(() => {
          setLines(prev => [...prev, makeLine(type, content)]);
        }, delay),
      );
    });

    const lastDelay = specs.length > 0 ? specs[specs.length - 1].delay + 400 : 400;
    timers.push(
      setTimeout(() => {
        setDone(true);
      }, lastDelay),
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [active, endingName, trustScore]);

  return { lines, done };
};
