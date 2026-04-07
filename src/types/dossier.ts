// ── Dossier ────────────────────────────────────────────────
// Cross-run persistence layer. Stored separately from GameState so it
// survives clearSave() between runs.

export type EndingName = 'LEAK' | 'SELL' | 'DESTROY' | 'FREE';

export interface EndingRecord {
  ending: EndingName;
  /** 1-based run depth at time of completion (capped at 4). */
  runDepth: number;
  timestamp: number;
}

export interface Dossier {
  /** Total number of completed runs (any ending). Incremented after each run. */
  runsCompleted: number;
  /** Ordered list of completed endings. */
  endings: EndingRecord[];
  /**
   * Aria memory notes accumulated across runs, most recent last.
   * Capped at 4 entries; older entries are dropped as new ones arrive.
   */
  ariaMemory: string[];
  /**
   * Set to true once the player has completed 4 or more runs.
   * Used by future systems (contracts, lore) to unlock additional content.
   */
  fullyExplored: boolean;
}
