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

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
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

export const app = new Hono();

app.post('*', async c => {
  let cameraId: string;
  let location: string;
  try {
    const rawBody: unknown = await c.req.json();
    const body = requireObject(rawBody, 'Request body');
    cameraId = requireString(body['cameraId'], 'cameraId');
    location = requireString(body['location'], 'location');
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['ARIA_AI_API_KEY'];
  if (!apiKey) {
    log.error('GEMINI_API_KEY not set (or ARIA_AI_API_KEY)');
    return c.json({ description: FALLBACK_DESCRIPTION }, 200);
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
