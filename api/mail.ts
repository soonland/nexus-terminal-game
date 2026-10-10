/**
 * POST /api/mail
 * Proxies to Gemini to generate one employee's mailbox.
 *
 * Request body:
 *   { ownerName, role, division, workstation: string,
 *     sessionSeed, trace, layer: number, ariaNameKnown: boolean }
 *
 * Response:
 *   200 { messages: [{ counterpart, direction: 'in'|'out', subject, body, day }] }
 *   200 { unavailable: true }   — no key, Gemini failed, or the output was unusable
 *   400 { error: string }       — malformed payload
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { makeLogger } from './_lib/logger.js';
import {
  ValidationError,
  requireBoolean,
  requireNumber,
  requireObject,
  requireString,
} from './_lib/validate.js';
import { scrubAriaName, withNameRule } from './_lib/ariaName.js';

export interface MailDraft {
  counterpart: string;
  direction: 'in' | 'out';
  subject: string;
  body: string;
  day: number; // 1..25, a day in October 2024
}

const log = makeLogger('mail');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const MAX_MESSAGES = 8;
const MAX_COUNTERPART = 60;
const MAX_SUBJECT = 100;
const MAX_BODY = 900;

// Mail must never accuse anyone, name the mole, or mention the player's employer.
const FORBIDDEN = /\b(mole|traitor|culprit|leaker|betray\w*|nexus)\b/i;

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text.slice(0, max);
};

export const parseMessages = (text: string, ariaNameKnown: boolean): MailDraft[] | null => {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const list = (data as { messages?: unknown }).messages;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_MESSAGES) return null;

  const out: MailDraft[] = [];
  for (const raw of list as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const m = raw as Record<string, unknown>;
    const counterpart = clean(m['counterpart'], MAX_COUNTERPART);
    const subject = clean(m['subject'], MAX_SUBJECT);
    const body = clean(m['body'], MAX_BODY);
    const direction = m['direction'];
    const day = m['day'];
    if (!counterpart || !subject || !body) continue;
    if (direction !== 'in' && direction !== 'out') continue;
    if (typeof day !== 'number' || !Number.isFinite(day)) continue;
    if (FORBIDDEN.test(`${counterpart} ${subject} ${body}`)) return null;
    out.push({
      counterpart: scrubAriaName(counterpart, ariaNameKnown),
      direction,
      subject: scrubAriaName(subject, ariaNameKnown),
      body: scrubAriaName(body, ariaNameKnown),
      day: Math.min(25, Math.max(1, Math.round(day))),
    });
  }
  return out.length > 0 ? out : null;
};

export const app = new Hono();

app.post('*', async c => {
  let ownerName: string;
  let role: string;
  let division: string;
  let workstation: string;
  let layer: number;
  let trace: number;
  let ariaNameKnown: boolean;
  try {
    const body = requireObject(await c.req.json(), 'Request body');
    ownerName = requireString(body['ownerName'], 'ownerName');
    role = requireString(body['role'], 'role');
    division = requireString(body['division'], 'division');
    workstation = requireString(body['workstation'], 'workstation');
    requireNumber(body['sessionSeed'], 'sessionSeed');
    trace = requireNumber(body['trace'], 'trace');
    layer = requireNumber(body['layer'], 'layer');
    ariaNameKnown = requireBoolean(body['ariaNameKnown'], 'ariaNameKnown');
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    log.error('GEMINI_API_KEY not set');
    return c.json({ unavailable: true }, 200);
  }

  const promptBase =
    `You write one employee's mailbox for a cyberpunk hacking game set inside the corporation ` +
    `IronGate. Employee: ${ownerName}, ${role}, ${division} division, workstation ${workstation}. ` +
    `Write 4 to ${String(MAX_MESSAGES)} routine office emails in this person's voice and the ` +
    `division's register: scheduling, equipment, policy reminders, small talk, expense and access ` +
    `chores. Mix messages received ("in") and sent ("out"). Each message has a short subject, a ` +
    `body under 80 words, a counterpart (a colleague's name, a team or a department) and a day ` +
    `of the month (1 to 25, October 2024). The current alert level is ${String(trace)}% and the ` +
    `player is on layer ${String(layer)}; ignore both unless the mail would naturally mention them. ` +
    `Do not accuse anyone of anything, do not name or hint at any mole, leak or betrayal, and do ` +
    `not mention any outside company called Nexus. Keep it mundane and plausible. ` +
    `Reply with JSON only, in this shape: ` +
    `{"messages":[{"counterpart":"...","direction":"in","subject":"...","body":"...","day":3}]}`;
  const prompt = withNameRule(promptBase, ariaNameKnown);

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1800,
          temperature: 0.9,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      log.error('Gemini HTTP error', res.status, await res.text());
      return c.json({ unavailable: true }, 200);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const messages = text ? parseMessages(text, ariaNameKnown) : null;
    if (!messages) {
      log.error('Gemini unusable mail output');
      return c.json({ unavailable: true }, 200);
    }
    return c.json({ messages }, 200);
  } catch (e) {
    log.error('Unexpected error', e);
    return c.json({ unavailable: true }, 200);
  }
});

app.all('*', c => c.json({ error: 'Method not allowed' }, 405));

// See api/file.ts: Vercel needs a named export per HTTP method.
const vercelHandler = handle(app);
export {
  vercelHandler as GET,
  vercelHandler as POST,
  vercelHandler as PUT,
  vercelHandler as PATCH,
  vercelHandler as DELETE,
  vercelHandler as OPTIONS,
  vercelHandler as HEAD,
};
