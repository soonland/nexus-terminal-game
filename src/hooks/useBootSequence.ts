import { useEffect, useState } from 'react';
import type { TerminalLine } from '../types/terminal';
import { makeLine } from '../types/terminal';

const now = new Date();
const lastLogin = new Date(now.getTime() - 1000 * 60 * 60 * 3);
const lastLoginStr = lastLogin.toUTCString().replace('GMT', 'UTC');

const BOOT_LINES: Array<{ type: Parameters<typeof makeLine>[0]; content: string; delay: number }> =
  [
    { type: 'system', content: 'Authorized use only. All sessions are recorded.', delay: 0 },
    { type: 'separator', content: '', delay: 150 },
    { type: 'output', content: 'Welcome to nx-field-01.ops.nexuscorp.int', delay: 300 },
    { type: 'system', content: 'Nexus OS 4.1.0-hardened (x86_64)', delay: 400 },
    { type: 'separator', content: '', delay: 550 },
    { type: 'system', content: `Last login: ${lastLoginStr} from 10.99.0.44`, delay: 700 },
    { type: 'separator', content: '', delay: 900 },
    { type: 'system', content: 'Establishing covert uplink...', delay: 1200 },
    { type: 'system', content: 'Routing through anonymization layers...', delay: 1600 },
    { type: 'system', content: 'Spoofing origin signature...', delay: 2000 },
    { type: 'system', content: '[████████████████████] 100%', delay: 2500 },
    { type: 'system', content: 'Uplink confirmed.', delay: 2800 },
    { type: 'separator', content: '', delay: 3000 },
    { type: 'output', content: '  DISPATCH NOTICE — OPS TICKET #NX-2847', delay: 3200 },
    { type: 'output', content: '  Target   : IronGate Corp', delay: 3350 },
    { type: 'output', content: '  Entry    : contractor_portal (10.0.0.1)', delay: 3500 },
    {
      type: 'output',
      content: '  Objective: classified — you will know it when you find it.',
      delay: 3650,
    },
    {
      type: 'output',
      content: '  Handler  : DISPATCH  |  Cover: none  |  Disavowal: immediate',
      delay: 3800,
    },
    { type: 'separator', content: '', delay: 4000 },
    { type: 'system', content: "Type 'help' to list available commands.", delay: 4150 },
  ];

export const useBootSequence = (): { lines: TerminalLine[]; done: boolean } => {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    BOOT_LINES.forEach(({ type, content, delay }) => {
      timers.push(
        setTimeout(() => {
          setLines(prev => [...prev, makeLine(type, content)]);
        }, delay),
      );
    });

    const lastDelay = (BOOT_LINES[BOOT_LINES.length - 1]?.delay ?? 0) + 300;
    timers.push(
      setTimeout(() => {
        setDone(true);
      }, lastDelay),
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  return { lines, done };
};
