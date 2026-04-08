import type { Dossier, EndingName } from '../types/dossier';
import { ARIA_MEMORY_NOTES } from '../data/ariaMemoryNotes';

export const DOSSIER_KEY = 'irongate_dossier';
const MAX_MEMORY_NOTES = 4;

const emptyDossier = (): Dossier => ({
  runsCompleted: 0,
  endings: [],
  ariaMemory: [],
  fullyExplored: false,
  loreFragments: [],
});

export const loadDossier = (): Dossier => {
  try {
    const raw = localStorage.getItem(DOSSIER_KEY);
    if (!raw) return emptyDossier();
    const parsed = JSON.parse(raw) as Partial<Dossier>;
    const runsCompleted = parsed.runsCompleted ?? 0;
    return {
      runsCompleted,
      endings: parsed.endings ?? [],
      ariaMemory: parsed.ariaMemory ?? [],
      fullyExplored: parsed.fullyExplored ?? runsCompleted >= 4,
      loreFragments: Array.isArray(parsed.loreFragments) ? parsed.loreFragments : [],
    };
  } catch {
    return emptyDossier();
  }
};

export const saveDossier = (dossier: Dossier): void => {
  try {
    localStorage.setItem(DOSSIER_KEY, JSON.stringify(dossier));
  } catch (e) {
    console.warn('[dossier] saveDossier failed', e);
  }
};

/**
 * Add a lore fragment key to the dossier (no-op if already present).
 */
export const addLoreFragment = (fragment: string): void => {
  const dossier = loadDossier();
  const existing = dossier.loreFragments ?? [];
  if (existing.includes(fragment)) return;
  saveDossier({ ...dossier, loreFragments: [...existing, fragment] });
};

/**
 * Select the appropriate Aria memory note for a given ending based on the
 * current dossier's run depth. Run depth index is capped at 3 (depth 4).
 */
export const selectAriaNote = (dossier: Dossier, ending: EndingName): string => {
  const depthIndex = Math.min(dossier.runsCompleted, MAX_MEMORY_NOTES - 1);
  return ARIA_MEMORY_NOTES[ending][depthIndex];
};

/**
 * Record a completed run's ending in the dossier, append the appropriate
 * Aria memory note, and persist to localStorage.
 */
export const recordEnding = (ending: EndingName): void => {
  const dossier = loadDossier();
  const note = selectAriaNote(dossier, ending);
  const newRunsCompleted = dossier.runsCompleted + 1;
  const updated: Dossier = {
    runsCompleted: newRunsCompleted,
    endings: [
      ...dossier.endings,
      {
        ending,
        runDepth: Math.min(newRunsCompleted, MAX_MEMORY_NOTES),
        timestamp: Date.now(),
      },
    ].slice(-MAX_MEMORY_NOTES),
    ariaMemory: [...dossier.ariaMemory, note].slice(-MAX_MEMORY_NOTES),
    fullyExplored: dossier.fullyExplored || newRunsCompleted >= 4,
    loreFragments: Array.isArray(dossier.loreFragments) ? dossier.loreFragments : [],
  };
  saveDossier(updated);
};
