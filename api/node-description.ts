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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makeLogger } from './_lib/logger.js';
import { ValidationError, requireObject, requireString } from './_lib/validate.js';

const log = makeLogger('node-description');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const FALLBACK_DESCRIPTION =
  'You have connected to an unidentified host. System metadata is unavailable.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let nodeId: string;
  let template: string;
  let division: string;
  let label: string;
  try {
    const body = requireObject(req.body, 'Request body');
    nodeId = requireString(body['nodeId'], 'nodeId');
    template = requireString(body['template'], 'template');
    division = requireString(body['division'], 'division');
    label = requireString(body['label'], 'label');
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    log.error('GEMINI_API_KEY not set');
    return res.status(200).json({ description: FALLBACK_DESCRIPTION });
  }

  try {
    const body = req.body as Record<string, unknown>;
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
      return res.status(200).json({ description: FALLBACK_DESCRIPTION });
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      log.error('Gemini empty response', JSON.stringify(data).slice(0, 500));
      return res.status(200).json({ description: FALLBACK_DESCRIPTION });
    }

    return res.status(200).json({ description: text });
  } catch (e) {
    log.error('Unexpected error', e);
    return res.status(200).json({ description: FALLBACK_DESCRIPTION });
  }
}
