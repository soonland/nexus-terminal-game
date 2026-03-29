/**
 * Minimal structured logger for API routes.
 * Usage: const log = makeLogger('aria');
 */

/* eslint-disable no-console */
export const makeLogger = (tag: string) => ({
  error: (msg: string, ...args: unknown[]): void => {
    console.error(`[${tag}]`, msg, ...args);
  },
  warn: (msg: string, ...args: unknown[]): void => {
    console.warn(`[${tag}]`, msg, ...args);
  },
});
/* eslint-enable no-console */
