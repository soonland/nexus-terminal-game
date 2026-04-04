import { useEffect, useState } from 'react';
import type { TerminalLine } from '../types/terminal';
import { makeLine } from '../types/terminal';

const now = new Date();
const lastLogin = new Date(now.getTime() - 1000 * 60 * 60 * 3);
const lastLoginStr = lastLogin.toUTCString().replace('GMT', 'UTC');

const BANNER = [
  '                                                              ',
  '    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗             ',
  '    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝             ',
  '    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗             ',
  '    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║             ',
  '    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║             ',
  '    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝            ',
  '                                                              ',
  '    Covert Operations Division  //  Field Terminal Access     ',
  '                                                              ',
];

const BANNER_DONE = BANNER.length * 60 + 200;

const BASE_BOOT_LINES: Array<{
  type: Parameters<typeof makeLine>[0];
  content: string;
  delay: number;
}> = [
  ...BANNER.map((line, i) => ({ type: 'output' as const, content: line, delay: i * 60 })),
  { type: 'separator', content: '', delay: BANNER_DONE },
  {
    type: 'system',
    content: 'Authorized use only. All sessions are recorded.',
    delay: BANNER_DONE + 150,
  },
  { type: 'separator', content: '', delay: BANNER_DONE + 300 },
  {
    type: 'output',
    content: 'Welcome to nx-field-01.ops.nexuscorp.int',
    delay: BANNER_DONE + 450,
  },
  { type: 'system', content: 'Nexus OS 4.1.0-hardened (x86_64)', delay: BANNER_DONE + 550 },
  { type: 'separator', content: '', delay: BANNER_DONE + 700 },
  {
    type: 'system',
    content: `Last login: ${lastLoginStr} from 10.99.0.44`,
    delay: BANNER_DONE + 900,
  },
  { type: 'separator', content: '', delay: BANNER_DONE + 1100 },
  {
    type: 'system',
    content: "Type 'help' to list available commands.",
    delay: BANNER_DONE + 1300,
  },
];

const buildBootLines = (
  nodeLabel: string,
  nodeIp: string,
): Array<{ type: Parameters<typeof makeLine>[0]; content: string; delay: number }> => [
  ...BASE_BOOT_LINES,
  {
    type: 'system',
    content: `You are at ${nodeLabel} (${nodeIp}). Start with: scan`,
    delay: BANNER_DONE + 1500,
  },
];

export const useBootSequence = (
  ready: boolean,
  nodeLabel = 'CONTRACTOR PORTAL',
  nodeIp = '10.0.0.1',
): { lines: TerminalLine[]; done: boolean } => {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!ready) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const BOOT_LINES = buildBootLines(nodeLabel, nodeIp);

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
  }, [ready, nodeLabel, nodeIp]);

  return { lines, done };
};
