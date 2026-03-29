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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makeLogger } from './_lib/logger.js';
import { ValidationError, requireObject, requireString } from './_lib/validate.js';

const log = makeLogger('file');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const FALLBACK_CONTENT =
  '[FILE CONTENT UNAVAILABLE — AI generation offline. Raw binary data suppressed.]';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate payload
  let nodeId: string;
  let fileName: string;
  try {
    const body = requireObject(req.body, 'Request body');
    nodeId = requireString(body['nodeId'], 'nodeId');
    fileName = requireString(body['fileName'], 'fileName');
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    log.error('GEMINI_API_KEY not set');
    return res.status(200).json({ content: FALLBACK_CONTENT });
  }

  try {
    const body = req.body as Record<string, unknown>;
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
      return res.status(200).json({ content: FALLBACK_CONTENT });
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      log.error('Gemini empty response', JSON.stringify(data).slice(0, 500));
      return res.status(200).json({ content: FALLBACK_CONTENT });
    }

    return res.status(200).json({ content: text });
  } catch (e) {
    log.error('Unexpected error', e);
    return res.status(200).json({ content: FALLBACK_CONTENT });
  }
}
