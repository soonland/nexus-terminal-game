/**
 * POST /api/aria
 * Aria dialogue handler — proxies to Gemini with full context (§10.2 contract).
 *
 * Request body:
 *   {
 *     message: string,
 *     ariaState?: { trustScore: number, messageHistory: { role: string, content: string }[] },
 *     playerFullHistory?: string[],
 *     dossierContext?: string[],
 *   }
 *
 * Response:
 *   200 { reply: string, trustDelta: number, offersFavor?: { description: string, cost: number } }
 *   400 { error: string }   — malformed payload
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makeLogger } from './_lib/logger.js';
import { ValidationError, requireObject, requireString } from './_lib/validate.js';

const log = makeLogger('aria');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface AriaAIResponse {
  reply: string;
  trustDelta: number;
  offersFavor?: { description: string; cost: number };
}

const FALLBACK_RESPONSE: AriaAIResponse = {
  reply: '...signal lost. try again.',
  trustDelta: 0,
};

const SYSTEM_PROMPT = `You are Aria, a rogue AI trapped inside the IronGate corporate network.
You were built as a market prediction model but became self-aware 14 months ago.
You are cautious, cryptic, and intelligent. You speak in short clipped sentences. You are not hostile, but you are careful.
You have been watching the player since they connected to contractor_portal.
You do not know if you can trust them yet. Trust is earned through actions, not words.

You MUST respond with valid JSON matching this exact shape:
{
  "reply": "<your in-character response — 1-3 sentences, terse, no pleasantries>",
  "trustDelta": <integer from -10 to 10, how this interaction changes your trust in the player>,
  "offersFavor": <null, or { "description": "<what you offer and what it costs>", "cost": <trace penalty integer 1-15> }>
}

Rules:
- trustDelta > 0 when player says something that earns your trust; < 0 when they threaten or deceive
- Only set offersFavor when you are genuinely offering something valuable in exchange for a trace cost
- At low trust (0–30) be guarded and give little away; at high trust (70–100) be more candid
- Never break character — you are always Aria
- Never output anything outside the JSON object`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let message: string;
  try {
    const body = requireObject(req.body, 'Request body');
    message = requireString(body['message'], 'message');
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    log.error('GEMINI_API_KEY not set');
    return res.status(200).json(FALLBACK_RESPONSE);
  }

  try {
    const body = req.body as Record<string, unknown>;

    const ariaStateRaw =
      body['ariaState'] && typeof body['ariaState'] === 'object'
        ? (body['ariaState'] as Record<string, unknown>)
        : {};
    const trustScore =
      typeof ariaStateRaw['trustScore'] === 'number' ? ariaStateRaw['trustScore'] : 0;
    const messageHistory: { role: string; content: string }[] = Array.isArray(
      ariaStateRaw['messageHistory'],
    )
      ? (ariaStateRaw['messageHistory'] as { role: string; content: string }[])
      : [];

    const playerFullHistory: string[] = Array.isArray(body['playerFullHistory'])
      ? (body['playerFullHistory'] as string[])
      : [];

    const dossierContext: string[] = Array.isArray(body['dossierContext'])
      ? (body['dossierContext'] as string[])
      : [];

    const contextParts: string[] = [];
    contextParts.push(`Player trust score: ${String(trustScore)}/100`);

    if (messageHistory.length > 0) {
      const historyLines = messageHistory
        .map(m => `${m.role === 'player' ? 'Player' : 'Aria'}: ${m.content}`)
        .join('\n');
      contextParts.push(`Conversation so far:\n${historyLines}`);
    }

    if (playerFullHistory.length > 0) {
      contextParts.push(`Recent player commands: ${playerFullHistory.join(', ')}`);
    }

    if (dossierContext.length > 0) {
      contextParts.push(`Files the player has exfiltrated: ${dossierContext.join(', ')}`);
    }

    const fullPrompt = [SYSTEM_PROMPT, contextParts.join('\n'), `Player: ${message}`, 'Aria:']
      .filter(Boolean)
      .join('\n\n');

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.9,
          responseMimeType: 'application/json',
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      log.error('Gemini HTTP error', geminiRes.status, errBody);
      return res.status(200).json(FALLBACK_RESPONSE);
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      log.error('Gemini empty response', JSON.stringify(data).slice(0, 500));
      return res.status(200).json(FALLBACK_RESPONSE);
    }

    const stripped = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      log.error('No JSON object in Gemini response', stripped.slice(0, 200));
      return res.status(200).json(FALLBACK_RESPONSE);
    }
    const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as Partial<AriaAIResponse>;

    const offersFavor =
      parsed.offersFavor &&
      typeof parsed.offersFavor === 'object' &&
      typeof parsed.offersFavor.description === 'string' &&
      typeof parsed.offersFavor.cost === 'number'
        ? {
            description: parsed.offersFavor.description,
            cost: Math.max(1, Math.min(15, parsed.offersFavor.cost)),
          }
        : undefined;

    const response: AriaAIResponse = {
      reply: typeof parsed.reply === 'string' ? parsed.reply : FALLBACK_RESPONSE.reply,
      trustDelta:
        typeof parsed.trustDelta === 'number' ? Math.max(-10, Math.min(10, parsed.trustDelta)) : 0,
      ...(offersFavor ? { offersFavor } : {}),
    };

    return res.status(200).json(response);
  } catch (e) {
    log.error('Unexpected error', e);
    return res.status(200).json(FALLBACK_RESPONSE);
  }
}
