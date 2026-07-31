/**
 * POST /api/node-description
 * Generates a 2–3 sentence flavour description for a filler node via Gemini.
 *
 * Request body:
 *   {
 *     nodeId: string,
 *     template: string,
 *     division: string,
 *     label: string,
 *     ariaInfluence?: number,   // 0–1
 *   }
 *
 * Response:
 *   200 { description: string }
 *   400 { error: string }          — malformed payload
 *   200 { description: string }    — fallback when Gemini is unavailable
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { makeLogger } from './_lib/logger.js';
import { ValidationError, requireObject, requireString } from './_lib/validate.js';

// Mirrors NodeTemplate from src/types/game.ts — kept in sync manually (api/ cannot import from src/)
type NodeTemplate =
  | 'workstation'
  | 'database_server'
  | 'file_server'
  | 'web_server'
  | 'security_node'
  | 'mail_server'
  | 'iot_device'
  | 'router_switch'
  | 'printer'
  | 'dev_server';

export interface NodeDescriptionRequest {
  nodeId: string;
  template: NodeTemplate;
  division: string;
  label: string;
  /** Aria influence level, 0–1. When > 0 hints at unusual node configuration. */
  ariaInfluence?: number;
}

export interface NodeDescriptionResponse {
  description: string;
}

const log = makeLogger('node-description');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const FALLBACK_DESCRIPTION =
  'You have connected to an unidentified host. System metadata is unavailable.';

export const app = new Hono();

app.post('*', async c => {
  let body: Record<string, unknown>;
  let nodeId: string;
  let template: string;
  let division: string;
  let label: string;
  try {
    const rawBody: unknown = await c.req.json();
    body = requireObject(rawBody, 'Request body');
    nodeId = requireString(body['nodeId'], 'nodeId');
    template = requireString(body['template'], 'template');
    division = requireString(body['division'], 'division');
    label = requireString(body['label'], 'label');
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    log.error('GEMINI_API_KEY not set');
    return c.json({ description: FALLBACK_DESCRIPTION }, 200);
  }

  try {
    const ariaInfluence = typeof body['ariaInfluence'] === 'number' ? body['ariaInfluence'] : 0;

    const ariaInstruction =
      ariaInfluence > 0
        ? ` This node has been subtly influenced by an AI called Aria (influence level: ${ariaInfluence.toFixed(2)}): hint at hidden structure or unusual configuration that does not quite fit its stated purpose.`
        : '';

    const prompt =
      `You are the environment narrator for a cyberpunk hacking game. ` +
      `Write a 2–3 sentence flavour description for a corporate network node the player has just connected to. ` +
      `Node: "${label}" (id: ${nodeId}, type: ${template}, division: ${division}).` +
      ariaInstruction +
      ` Style: present tense, second person, cold and observational. No markdown. No greetings. No meta-commentary.`;

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 0.7 },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      log.error('Gemini HTTP error', geminiRes.status, errBody);
      return c.json({ description: FALLBACK_DESCRIPTION }, 200);
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      log.error('Gemini empty response', JSON.stringify(data).slice(0, 500));
      return c.json({ description: FALLBACK_DESCRIPTION }, 200);
    }

    return c.json({ description: text }, 200);
  } catch (e) {
    log.error('Unexpected error', e);
    return c.json({ description: FALLBACK_DESCRIPTION }, 200);
  }
});

app.all('*', c => c.json({ error: 'Method not allowed' }, 405));

// Vercel Functions expect either the legacy (req, res) signature or named
// exports per HTTP method returning a Response — a default export that
// returns a Response is only recognized for the single consolidated-app
// entry point (app.ts/index.ts/server.ts), not for per-route files like
// this one. Export the same Hono-wrapped handler under every method so
// our app-level 405 fallback (above) is what runs, not Vercel's own.
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
