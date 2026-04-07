import { DosModal } from './DosModal';
import { boxRow } from './dosModalHelpers';

const IW = 60;
const r = (s = '') => boxRow(IW, s);

const mono = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size)',
  lineHeight: 'var(--line-height)',
  whiteSpace: 'pre' as const,
  display: 'block' as const,
  margin: 0,
};

type HelpLine = { text: string; color: string };

const BODY: HelpLine[] = [
  { text: r(), color: 'var(--color-system)' },
  { text: r('LOCAL COMMANDS (no trace):'), color: 'var(--color-output)' },
  { text: r('  help          -this message'), color: 'var(--color-system)' },
  {
    text: r('  whoami        -current account and operative identity'),
    color: 'var(--color-system)',
  },
  { text: r('  briefing      -re-read mission briefing'), color: 'var(--color-system)' },
  { text: r('  notes         -intel log (creds, nodes, exfils)'), color: 'var(--color-system)' },
  { text: r('  status        -session overview'), color: 'var(--color-system)' },
  { text: r('  map           -discovered network nodes'), color: 'var(--color-system)' },
  { text: r('  clear         -clear terminal'), color: 'var(--color-system)' },
  { text: r(), color: 'var(--color-system)' },
  { text: r('ENGINE COMMANDS:'), color: 'var(--color-output)' },
  {
    text: r('  scan                -scan current subnet (+1 trace)'),
    color: 'var(--color-system)',
  },
  {
    text: r('  scan [ip]           -probe a specific node (+1 trace)'),
    color: 'var(--color-system)',
  },
  { text: r('  connect [ip]        -connect to a node'), color: 'var(--color-system)' },
  {
    text: r('  login [user] [pass] -authenticate (+5 trace on fail)'),
    color: 'var(--color-system)',
  },
  { text: r('  ls [path]           -list files'), color: 'var(--color-system)' },
  { text: r('  cat [filepath]      -read a file'), color: 'var(--color-system)' },
  { text: r('  cat local:[file]    -read an exfiltrated file'), color: 'var(--color-system)' },
  {
    text: r('  disconnect          -back to previous node (exit/logout)'),
    color: 'var(--color-system)',
  },
  {
    text: r('  exploit [service]   -exploit a service (costs charges)'),
    color: 'var(--color-system)',
  },
  {
    text: r('  exfil [filepath]    -exfiltrate a file (+3 trace, notes)'),
    color: 'var(--color-system)',
  },
  {
    text: r('  wipe-logs           -trace -15 (requires log-wiper)'),
    color: 'var(--color-system)',
  },
  {
    text: r('  spoof               -trace -20 (requires spoof-id)'),
    color: 'var(--color-system)',
  },
  { text: r(), color: 'var(--color-system)' },
  { text: r('MESSAGING:'), color: 'var(--color-output)' },
  {
    text: r('  msg sentinel       -open Sentinel channel'),
    color: 'var(--color-system)',
  },
  {
    text: r('  msg aria <message> -send a message to Aria'),
    color: 'var(--color-system)',
  },
  { text: r(), color: 'var(--color-system)' },
  { text: r('FILE MARKERS:'), color: 'var(--color-output)' },
  { text: r('  [!]       -tripwire: reading costs up to +25 trace'), color: 'var(--color-system)' },
  { text: r('  [no-exfil]-file cannot be exfiltrated'), color: 'var(--color-system)' },
  { text: r('  [LOCKED]  -file locked by watchlist; cat denied'), color: 'var(--color-system)' },
  { text: r(), color: 'var(--color-system)' },
  { text: r('ACCESS LEVELS:  none < user < admin < root'), color: 'var(--color-system)' },
  { text: r(), color: 'var(--color-system)' },
];

interface Props {
  onClose: () => void;
}

export const HelpModal = ({ onClose }: Props) => (
  <DosModal title=" COMMAND REFERENCE " innerWidth={IW} onClose={onClose}>
    {BODY.map((line, i) => (
      <div key={i} style={{ ...mono, color: line.color }}>
        {line.text}
      </div>
    ))}
  </DosModal>
);
