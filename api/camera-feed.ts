/**
 * POST /api/camera-feed
 * Proxies to Gemini (CCTV camera description generation).
 *
 * Request body:
 *   { cameraId: string, location: string }
 *
 * Response:
 *   200 { description: string }
 *   400 { error: string }          — malformed payload
 *   200 { description: string }    — fallback when Gemini is unavailable
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makeLogger } from './_lib/logger.js';
import { ValidationError, requireObject, requireString } from './_lib/validate.js';

export interface CameraFeedRequest {
  cameraId: string;
  location: string;
}

export interface CameraFeedResponse {
  description: string;
}

const log = makeLogger('camera-feed');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const FALLBACK_DESCRIPTION = 'FEED DEGRADED — signal lost';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let cameraId: string;
  let location: string;
  try {
    const body = requireObject(req.body, 'Request body');
    cameraId = requireString(body['cameraId'], 'cameraId');
    location = requireString(body['location'], 'location');
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['ARIA_AI_API_KEY'];
  if (!apiKey) {
    log.error('GEMINI_API_KEY not set (or ARIA_AI_API_KEY)');
    return res.status(200).json({ description: FALLBACK_DESCRIPTION });
  }

  try {
    const safeCameraId = cameraId.slice(0, 16).replace(/[^\w]/g, '');
    const safeLocation = location
      .slice(0, 64)
      .replace(/[^\w ]/g, '')
      .replaceAll('_', ' ');

    const prompt =
      `You are a security camera feed display system inside IronGate Corp, a powerful and secretive corporation. ` +
      `Generate a terse, clinical surveillance description of what camera ${safeCameraId} (location: ${safeLocation}) currently shows. ` +
      `Write in present tense. Exactly two to three complete sentences. Describe people, activity, lighting, and any anomalies. ` +
      `Tone: cold, factual, sci-fi noir. No markdown. No prefix of any kind — begin directly with the description.`;

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.85,
          thinkingConfig: { thinkingBudget: 0 },
        },
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
