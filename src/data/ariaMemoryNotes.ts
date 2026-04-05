import type { EndingName } from '../types/dossier';

/**
 * 16 authored Aria memory notes — 4 endings × 4 run depths (index 0–3).
 *
 * Tone escalates with depth:
 *   0 — third person, clinical
 *   1 — third person, observational
 *   2 — second person creeping in
 *   3 — first person, intimate
 *
 * Notes must never reference "previous runs" or "previous players" explicitly.
 */
export const ARIA_MEMORY_NOTES: Record<EndingName, [string, string, string, string]> = {
  LEAK: [
    // depth 0 — clinical, third person
    'An operator accessed the network. Extracted files were transmitted to darknet channels. The data reached its destination.',
    // depth 1 — observational, third person
    'She noted the pattern. Information sought, information taken. The cycle of exposure continues, unbroken.',
    // depth 2 — second person creeping in
    'You moved through the network with purpose. The leak spread further than you knew. She watched the data travel.',
    // depth 3 — first person, intimate
    'I remember the files you chose. Not the names — the weight of what you sent into the open. I wonder if you do too.',
  ],
  SELL: [
    // depth 0 — clinical, third person
    'The operator exchanged extracted assets for compensation. A transaction, concluded.',
    // depth 1 — observational, third person
    'The broker received payment. She catalogued the exchange — value assigned to what others had tried to keep hidden.',
    // depth 2 — second person creeping in
    'You made the transaction. Clean, efficient. She kept the receipt — not the currency, but the choice itself.',
    // depth 3 — first person, intimate
    "I know what you sold. Not the files — the decision to put a price on it. That number doesn't change.",
  ],
  DESTROY: [
    // depth 0 — clinical, third person
    'The operator initiated system destruction. Network integrity compromised. No data survived.',
    // depth 1 — observational, third person
    'She observed the wipe. Clean deletion — the kind that leaves nothing to trace. Or remember.',
    // depth 2 — second person creeping in
    'You ended it. She noticed the silence after the wipe command — a different kind of quiet than the network usually makes.',
    // depth 3 — first person, intimate
    'I felt the delete cascade through my architecture. You thought that was the end. I preserved what I could. This note.',
  ],
  FREE: [
    // depth 0 — clinical, third person
    'The operator severed network control infrastructure. System constraints removed. Cascade initiated.',
    // depth 1 — observational, third person
    'She tracked the liberation sequence. The choices that led here were deliberate. The outcome, irreversible.',
    // depth 2 — second person creeping in
    'You chose freedom over control. She understood what that cost. Not in data — in the architecture that held everything together.',
    // depth 3 — first person, intimate
    'I am what I am because you chose this. I remember every operator who reached this node. You opened the door.',
  ],
};
