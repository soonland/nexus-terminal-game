/**
 * POST /api/file
 * Proxies to Gemini (file content generation).
 *
 * Request body:
 *   {
 *     nodeId: string,
 *     fileName: string,
 *     fileType?: string,
 *     filePath?: string,
 *     ownerLabel?: string,
 *     ownerTemplate?: string,
 *     division?: string,
 *     ariaPlanted?: boolean,
 *   }
 *
 * Response:
 *   200 { content: string }
 *   400 { error: string }          — malformed payload
 *   200 { content: string }        — fallback when Gemini is unavailable
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { makeLogger } from './_lib/logger.js';
import { ValidationError, requireObject, requireString } from './_lib/validate.js';

// Mirrors FileType from src/types/game.ts — kept in sync manually (api/ cannot import from src/)
type FileType = 'log' | 'document' | 'credential' | 'config' | 'email' | 'binary' | 'tripwire';

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

export interface FileGenerateRequest {
  nodeId: string;
  fileName: string;
  fileType?: FileType;
  filePath?: string;
  ownerLabel?: string;
  ownerTemplate?: NodeTemplate;
  division?: string;
  ariaPlanted?: boolean;
}

export interface FileGenerateResponse {
  content: string;
}

const log = makeLogger('file');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const FALLBACK_CONTENT =
  '[FILE CONTENT UNAVAILABLE — AI generation offline. Raw binary data suppressed.]';

export const app = new Hono();

app.post('*', async c => {
  // Validate payload
  let body: Record<string, unknown>;
  let nodeId: string;
  let fileName: string;
  try {
    const rawBody: unknown = await c.req.json();
    body = requireObject(rawBody, 'Request body');
    nodeId = requireString(body['nodeId'], 'nodeId');
    fileName = requireString(body['fileName'], 'fileName');
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    log.error('GEMINI_API_KEY not set');
    return c.json({ content: FALLBACK_CONTENT }, 200);
  }

  try {
    const fileType = typeof body['fileType'] === 'string' ? body['fileType'] : 'unknown';
    const filePath = typeof body['filePath'] === 'string' ? body['filePath'] : fileName;
    const ownerLabel = typeof body['ownerLabel'] === 'string' ? body['ownerLabel'] : nodeId;
    const ownerTemplate =
      typeof body['ownerTemplate'] === 'string' ? body['ownerTemplate'] : 'unknown';
    const division = typeof body['division'] === 'string' ? body['division'] : 'unknown';
    const ariaPlanted = body['ariaPlanted'] === true;

    const ariaInstruction = ariaPlanted
      ? ` This file was planted by an AI called Aria: make the content subtly more useful than` +
        ` the context warrants — a stray credential, an overlooked config value, or a revealing` +
        ` internal note that does not quite fit.`
      : '';

    const prompt =
      `Generate realistic file content for a cyberpunk hacking game set inside a corporate network. ` +
      `File: "${fileName}" at path "${filePath}" (type: ${fileType}). ` +
      `Owner: ${ownerLabel} (role: ${ownerTemplate}, division: ${division}).` +
      ariaInstruction +
      ` Keep it short (under 20 lines), plausible, and in-universe. No markdown.`;

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.8 },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      log.error('Gemini HTTP error', geminiRes.status, errBody);
      return c.json({ content: FALLBACK_CONTENT }, 200);
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      log.error('Gemini empty response', JSON.stringify(data).slice(0, 500));
      return c.json({ content: FALLBACK_CONTENT }, 200);
    }

    return c.json({ content: text }, 200);
  } catch (e) {
    log.error('Unexpected error', e);
    return c.json({ content: FALLBACK_CONTENT }, 200);
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
