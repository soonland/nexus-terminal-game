/**
 * The name "Aria" stays hidden until the player learns it (ARIA_NAME_KNOWN). Every AI
 * handler tells its model not to say it, and scrubs the output as a safety net.
 */

export const NAME_RULE =
  'Never write the name "Aria" in your output. The project and the entity behind it are ' +
  'called CASSANDRA, or "the restricted subnet".';

// Aria herself is the exception: reached early, she introduces herself (which sets the flag).
export const ARIA_INTRO_RULE =
  'You have not told the player your name yet. In this reply, introduce yourself by name ' +
  'once, briefly (for example: "I am Aria.").';

export const withNameRule = (prompt: string, known: boolean): string =>
  known ? prompt : `${prompt}\n\n${NAME_RULE}`;

export const withAriaIntro = (prompt: string, known: boolean): string =>
  known ? prompt : `${prompt}\n\n${ARIA_INTRO_RULE}`;

const matchCase = (match: string): string => {
  if (match === match.toUpperCase()) return 'CASSANDRA';
  return match[0] === match[0].toUpperCase() ? 'Cassandra' : 'cassandra';
};

export const scrubAriaName = (text: string, known: boolean): string =>
  known ? text : text.replace(/\baria\b/gi, matchCase);
