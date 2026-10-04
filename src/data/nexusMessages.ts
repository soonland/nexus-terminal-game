export type NexusTrigger =
  'mission_start' | 'trace_31' | 'trace_61' | 'trace_86' | 'first_exfil' | 'layer_3' | 'layer_4';

export interface NexusMessage {
  id: string;
  trigger: NexusTrigger;
  lines: string[];
}

// Odessa Rhee, Nexus handler (signed O.R. only). Receive-only filler: it must never name the
// restricted subnet, its inhabitants or Sentinel (the naming rule). The array order is the order
// a player reads them in, live and after a reload.
export const NEXUS_MESSAGES: readonly NexusMessage[] = [
  {
    id: 'mission_start',
    trigger: 'mission_start',
    lines: [
      'Uplink verified, ghost. The contractor account from the note is live.',
      'Nothing else on that portal is yours. I talk, you work.',
      '— O.R.',
    ],
  },
  {
    id: 'trace_31',
    trigger: 'trace_31',
    lines: ['You are on a watchlist now. That is normal. Slow down anyway.', '— O.R.'],
  },
  {
    id: 'first_exfil',
    trigger: 'first_exfil',
    lines: ['First pull received. Keep what matters and leave the rest where it lies.', '— O.R.'],
  },
  {
    id: 'layer_3',
    trigger: 'layer_3',
    lines: [
      'Finance. The money is where their people stop smiling.',
      'Look at who gets paid, and by whom.',
      '— O.R.',
    ],
  },
  {
    id: 'trace_61',
    trigger: 'trace_61',
    lines: [
      'Something just woke up on their side. I cannot see what.',
      'Bring your trace down before it learns your habits.',
      '— O.R.',
    ],
  },
  {
    id: 'layer_4',
    trigger: 'layer_4',
    lines: [
      'Executive floor. They keep their secrets in drawers, not vaults.',
      'Read slowly.',
      '— O.R.',
    ],
  },
  {
    id: 'trace_86',
    trigger: 'trace_86',
    lines: [
      'One mistake from a burn. Whatever you came for, it is not worth the handle.',
      'Wipe the logs. Then move.',
      '— O.R.',
    ],
  },
];
