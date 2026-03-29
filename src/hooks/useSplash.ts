import { useEffect, useState } from 'react';
import type { TerminalLine } from '../types/terminal';
import { makeLine } from '../types/terminal';

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

const SPLASH_LINES: Array<{
  type: Parameters<typeof makeLine>[0];
  content: string;
  delay: number;
}> = [
  ...BANNER.map((line, i) => ({ type: 'output' as const, content: line, delay: i * 60 })),
  { type: 'separator', content: '', delay: BANNER.length * 60 + 100 },
  {
    type: 'error',
    content: '  WARNING: This system is for authorized Nexus Corp personnel only.',
    delay: BANNER.length * 60 + 250,
  },
  {
    type: 'system',
    content: '  All activity on this system is monitored and recorded.',
    delay: BANNER.length * 60 + 400,
  },
  {
    type: 'system',
    content: '  Unauthorized access will be prosecuted to the fullest extent of law.',
    delay: BANNER.length * 60 + 550,
  },
  { type: 'separator', content: '', delay: BANNER.length * 60 + 700 },
];

const DONE_DELAY = BANNER.length * 60 + 900;

export const useSplash = (): { lines: TerminalLine[]; done: boolean } => {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    SPLASH_LINES.forEach(({ type, content, delay }) => {
      timers.push(
        setTimeout(() => {
          setLines(prev => [...prev, makeLine(type, content)]);
        }, delay),
      );
    });

    timers.push(
      setTimeout(() => {
        setDone(true);
      }, DONE_DELAY),
    );
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  return { lines, done };
};
