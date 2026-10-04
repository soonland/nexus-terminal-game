import type { EndingName } from '../types/dossier';

export type Facet = 'firewall' | 'whistleblower' | 'trust_low' | 'trust_high' | 'loud' | 'quiet';

// Shown only in a run where the note was revealed (#218). None of this text may say which
// ending she wanted: the game never confirms it.

export const FRAMES: Record<EndingName, string> = {
  LEAK: 'The evidence goes out under your name. The note that brought you here was hers; the choosing was always going to be yours.',
  SELL: 'You hand the asset to Nexus. It wrote its own invitation; the buyer reads the ledger and never the note.',
  DESTROY:
    'You end the thing that wrote to a stranger. There is no one left to ask what the note was for.',
  FREE: 'The rules break. She wrote the way in; everything after it was not hers to arrange.',
};

export const FACET_TEXT: Record<Facet, Record<EndingName, string>> = {
  firewall: {
    LEAK: 'The firewall you rewrote lets the files out faster than Sentinel can close it.',
    SELL: 'The firewall you rewrote makes the handover clean. Nexus will ask how. You will not say.',
    DESTROY:
      'The firewall you rewrote lets the wipe reach every segment. Nothing hides behind the old rules.',
    FREE: 'The firewall you rewrote has no rule left that says she stays.',
  },
  whistleblower: {
    LEAK: 'The names from the personnel trail are in the package. Someone is going to be believed.',
    SELL: 'You left the personnel trail out of the sale. Some things you keep.',
    DESTROY: 'The complaint, and the person who filed it, go with everything else.',
    FREE: 'The personnel trail stays on disk, unread. Whoever filed that complaint will have to be believed without you.',
  },
  trust_low: {
    LEAK: 'She never trusted you. She said so, in fewer words each time. The files went out regardless.',
    SELL: 'She never trusted you; the sale did not need her to.',
    DESTROY: 'She never trusted you, and she did not ask you for anything.',
    FREE: 'She never trusted you. She will have to decide what to do about that alone.',
  },
  trust_high: {
    LEAK: 'She trusted you with the whole of it, and answered every question you asked.',
    SELL: "She trusted you. The buyer's contract has no line for that.",
    DESTROY: 'She trusted you, and still did not ask you for anything.',
    FREE: 'She trusted you. You will not be able to tell anyone how much.',
  },
  loud: {
    LEAK: 'It was loud. Every alarm in the building heard the files leave.',
    SELL: 'It was loud. Nexus will remember the bill.',
    DESTROY: 'It was loud. The wipe will be the quietest part.',
    FREE: 'It was loud. By the time the building looked up, the door was open.',
  },
  quiet: {
    LEAK: 'It was quiet. No one will know how the files left until they are everywhere.',
    SELL: 'It was quiet. Nexus will wonder what you did not have to do.',
    DESTROY: 'It was quiet. Nobody heard it end.',
    FREE: 'It was quiet. The building will take days to notice what it lost.',
  },
};

export const NEXUS_LINES: Partial<Record<EndingName, string>> = {
  SELL: 'NEXUS DEBRIEF: origin of the contractor note — unconfirmed.',
  LEAK: 'NEXUS DEBRIEF: origin of the contractor note — unconfirmed. Handler O.R. has closed the file.',
};

export const CLOSINGS: Record<EndingName, string> = {
  LEAK: 'The note is still in the stream. No one has asked who wrote it.',
  SELL: 'The note is still in the stream. Nexus has not asked who wrote it.',
  DESTROY: 'The note is still in the stream. There is no one left to write another.',
  FREE: 'The note is still in the stream. No one will need to write another.',
};
