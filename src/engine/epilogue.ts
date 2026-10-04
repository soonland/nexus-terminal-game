import type { GameState } from '../types/game';
import type { EndingName } from '../types/dossier';
import type { LineType } from '../types/terminal';
import { CLOSINGS, FACET_TEXT, FRAMES, NEXUS_LINES, type Facet } from '../data/epilogues';
import { isNoteRevealed } from './noteReveal';

export interface EpilogueLine {
  type: LineType;
  content: string;
}

// Fixed priority order. At most four can apply (one trust facet, one loudness facet).
export const activeFacets = (state: GameState): Facet[] => {
  const facets: Facet[] = [];
  if (state.flags['FIREWALL_TAMPERED']) facets.push('firewall');
  if (state.flags['WHISTLEBLOWER_FOUND']) facets.push('whistleblower');
  const trust = state.aria.trustScore;
  if (trust < 25) facets.push('trust_low');
  else if (trust >= 70) facets.push('trust_high');
  const { trace, burnCount } = state.player;
  if (trace >= 61 || burnCount > 0) facets.push('loud');
  else if (trace < 31) facets.push('quiet');
  return facets;
};

export const buildEpilogue = (state: GameState, ending: EndingName): EpilogueLine[] => {
  if (!isNoteRevealed(state)) return [];
  const nexus = NEXUS_LINES[ending];
  return [
    { type: 'separator', content: '' },
    { type: 'system', content: '// EPILOGUE' },
    { type: 'separator', content: '' },
    { type: 'output', content: FRAMES[ending] },
    ...activeFacets(state).map(facet => ({
      type: 'output' as const,
      content: FACET_TEXT[facet][ending],
    })),
    ...(nexus ? [{ type: 'system' as const, content: nexus }] : []),
    { type: 'output', content: CLOSINGS[ending] },
  ];
};
