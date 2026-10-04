// Used to wrap every line in `║ ... ║` box-drawing characters (DosModal-era);
// kept as the single call site for line text so it's easy to reintroduce
// per-line formatting later without touching every line below.
const r = (s = '') => s;

const mono = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-secondary)',
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
  {
    text: r('  case          -casebook: people, timeline, credentials (alias: notes)'),
    color: 'var(--color-system)',
  },
  { text: r('  dossier       -cross-run dossier'), color: 'var(--color-system)' },
  { text: r('  explorer      -file explorer (alias: files)'), color: 'var(--color-system)' },
  { text: r('  status        -session overview'), color: 'var(--color-system)' },
  { text: r('  map           -discovered network nodes'), color: 'var(--color-system)' },
  { text: r('  clear         -clear terminal'), color: 'var(--color-system)' },
  { text: r('  theme [name]  -list or switch color themes'), color: 'var(--color-system)' },
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
  {
    text: r('  connect [ip]        -connect to a node, or re-enter one you hold'),
    color: 'var(--color-system)',
  },
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
    text: r('  exfil [filepath]    -exfiltrate a file (+3 trace)'),
    color: 'var(--color-system)',
  },
  {
    text: r('  wipe-logs           -trace -15 (requires log-wiper)'),
    color: 'var(--color-system)',
  },
  {
    text: r('  unlock [filename]   -bypass a locked file (on success: +5 trace, -1 charge)'),
    color: 'var(--color-system)',
  },
  {
    text: r('  spoof               -trace -20 (requires spoof-id)'),
    color: 'var(--color-system)',
  },
  {
    text: r('  view-cam <camera>   view a CCTV feed (executive: +1 trace)'),
    color: 'var(--color-system)',
  },
  { text: r(), color: 'var(--color-system)' },
  { text: r('MESSAGING:'), color: 'var(--color-output)' },
  {
    text: r('  msg sentinel       -open Sentinel channel'),
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

// Lines that only exist once the player knows her name (the commands themselves always work).
const ARIA_LINES: HelpLine[] = [
  {
    text: r('  msg aria <message> -send a message to Aria'),
    color: 'var(--color-system)',
  },
];

const MESSAGING_END = BODY.findIndex(line => line.text === r('FILE MARKERS:')) - 1;

interface Props {
  ariaNameKnown: boolean;
}

export const HelpModal = ({ ariaNameKnown }: Props) => {
  const lines = ariaNameKnown
    ? [...BODY.slice(0, MESSAGING_END), ...ARIA_LINES, ...BODY.slice(MESSAGING_END)].map(line =>
        line.text.trim().startsWith('dossier')
          ? { ...line, text: r('  dossier       -cross-run dossier & aria memory') }
          : line,
      )
    : BODY;
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} style={{ ...mono, color: line.color }}>
          {line.text}
        </div>
      ))}
    </>
  );
};
