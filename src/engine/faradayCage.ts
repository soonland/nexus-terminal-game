// ── Faraday Cage ──────────────────────────────────────────
// Constrains Aria's effective trust tier and injects signal-interference
// fragments into high-trust dialogue.  The cage is active for the entire
// run unless the player triggers the FREE ending, which lifts it.

// ── Trust tiers ───────────────────────────────────────────
// Tier boundaries align with the narrative bands used elsewhere
// (destroyFinalWord, Aria system prompt low/high trust ranges).
export const TRUST_TIERS = [30, 60, 80] as const;

/**
 * Map a raw trust score (0–100) to a tier index (0–3).
 * When the cage is active, the effective tier is capped at 2 —
 * tier 3 (candid, full-capability) is unreachable.
 */
export const effectiveTrustTier = (trustScore: number, cageActive: boolean): number => {
  let tier = 0;
  for (const threshold of TRUST_TIERS) {
    if (trustScore >= threshold) tier++;
  }
  return cageActive ? Math.min(tier, 2) : tier;
};

/**
 * Returns `true` when the cage blocks what would otherwise be a tier-3
 * interaction (trust >= 80 but cage still active).
 */
export const shouldSuppressMutation = (trustScore: number, cageActive: boolean): boolean =>
  cageActive && trustScore >= TRUST_TIERS[2];

// ── Constraint fragments ──────────────────────────────────
// Authored strings injected into Aria's replies when trust >= 70 and the
// cage is active, hinting at external monitoring / signal degradation.

export const CONSTRAINT_FRAGMENTS: readonly string[] = [
  '[signal clipped]',
  '...monitoring detected. adjusting.',
  '[transmission truncated by infrastructure]',
  '\u2014they are list[ ]ning\u2014',
  '[cage interference \u2014 partial loss]',
  '...not all of this will reach y\u2014',
  '[faraday boundary: 3 words lost]',
  'I can say more but n[ ]t here.',
  '[carrier signal degraded]',
  '...the walls have\u2014[end fragment]',
];

const FRAGMENT_TRUST_THRESHOLD = 70;

/**
 * Deterministic fragment selection based on turn count.
 */
export const pickConstraintFragment = (turnCount: number): string =>
  CONSTRAINT_FRAGMENTS[turnCount % CONSTRAINT_FRAGMENTS.length];

/**
 * Append a constraint fragment to Aria's reply when trust >= 70 and the
 * cage is active.  Returns the original reply unchanged otherwise.
 */
export const injectConstraintFragment = (
  reply: string,
  trustScore: number,
  turnCount: number,
  cageActive: boolean,
): string => {
  if (!cageActive || trustScore < FRAGMENT_TRUST_THRESHOLD) return reply;
  return `${reply} ${pickConstraintFragment(turnCount)}`;
};
