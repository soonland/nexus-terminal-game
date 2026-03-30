import { DosModal } from './DosModal';
import { boxRow } from './dosModalHelpers';

const IW = 68;
const r = (s = '') => boxRow(IW, s);

type BodyLine = { text: string; color: string };

const BODY: BodyLine[] = [
  { text: r(), color: 'var(--color-system)' },
  { text: r('OPERATIVE      : ghost'), color: 'var(--color-output)' },
  { text: r('TICKET         : NX-2847'), color: 'var(--color-output)' },
  { text: r('CLEARANCE      : [REDACTED]'), color: 'var(--color-output)' },
  { text: r('ISSUED         : [AUTO-WIPED AT 0400]'), color: 'var(--color-output)' },
  { text: r(), color: 'var(--color-system)' },
  {
    text: r('The brief was three lines. Encrypted channel, single read.'),
    color: 'var(--color-system)',
  },
  { text: r('That is how DISPATCH works.'), color: 'var(--color-system)' },
  { text: r(), color: 'var(--color-system)' },
  { text: r('TARGET         : IRONGATE CORP'), color: 'var(--color-output)' },
  { text: r('ENTRY VECTOR   : CONTRACTOR PORTAL - 10.0.0.1'), color: 'var(--color-output)' },
  {
    text: r('COVER IDENTITY : BUILT IN-HOUSE. PASSES STANDARD CHECKS.'),
    color: 'var(--color-output)',
  },
  { text: r(), color: 'var(--color-system)' },
  {
    text: r('OBJECTIVE      : LOCATE AND ASSESS EXECUTIVE SUBNET ASSET.'),
    color: 'var(--color-output)',
  },
  { text: r('               : YOU WILL KNOW IT WHEN YOU FIND IT.'), color: 'var(--color-output)' },
  { text: r('EXFIL PROTOCOL : NONE ASSIGNED.'), color: 'var(--color-output)' },
  { text: r(), color: 'var(--color-system)' },
  {
    text: r('NOTE_01.TXT was attached. You read it before the channel wiped.'),
    color: 'var(--color-system)',
  },
  { text: r(), color: 'var(--color-system)' },
];

const mono = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size)',
  lineHeight: 'var(--line-height)',
  whiteSpace: 'pre' as const,
  display: 'block' as const,
  margin: 0,
};

interface Props {
  onClose: () => void;
}

export const BriefingModal = ({ onClose }: Props) => (
  <DosModal title=" OPERATIVE ACTIVATION NOTICE " innerWidth={IW} onClose={onClose}>
    {BODY.map((line, i) => (
      <div key={i} style={{ ...mono, color: line.color }}>
        {line.text}
      </div>
    ))}
  </DosModal>
);
