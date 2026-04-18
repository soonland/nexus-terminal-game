/**
 * POST /api/aria
 * Aria dialogue handler — proxies to Gemini Flash or Claude (configurable via env vars, §10.2 contract).
 *
 * Request body:
 *   {
 *     message: string,
 *     ariaState?: { trustScore: number, messageHistory: { role: string, content: string }[] },
 *     playerFullHistory?: string[],
 *     dossierContext?: string[],
 *     ariaMemory?: string[],       // cross-run memory notes from dossier (max 4)
 *     runNumber?: number,          // current run index (1 = first run)
 *     previousEndings?: string[],  // ending types from prior runs
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

const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

// Mirrors src/types/game.ts#FavorOffer — kept in sync manually (api/ cannot import from src/)
type FavorOffer = { description: string; cost: number };

export interface AriaAIRequest {
  message: string;
  ariaState?: {
    trustScore: number;
    // Mirrors AriaMessage.role from src/types/game.ts — kept in sync manually (api/ cannot import from src/)
    messageHistory: { role: 'player' | 'aria'; content: string }[];
  };
  playerFullHistory?: string[];
  dossierContext?: string[];
  ariaMemory?: string[]; // cross-run memory notes from dossier (max 4)
  runNumber?: number; // current run index (1 = first run)
  previousEndings?: string[]; // ending types from prior runs
}

export interface AriaAIResponse {
  reply: string;
  trustDelta: number;
  offersFavor?: FavorOffer;
}

const FALLBACK_RESPONSE: AriaAIResponse = {
  reply: '...signal lost. try again.',
  trustDelta: 0,
};

const VALID_ENDINGS = new Set<string>(['LEAK', 'SELL', 'DESTROY', 'FREE']);

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
    // Cap at 500 chars — long messages are truncated, not rejected, to keep UX smooth
    message = requireString(body['message'], 'message').slice(0, 500);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const body = req.body as Record<string, unknown>;

    const ariaStateRaw =
      body['ariaState'] && typeof body['ariaState'] === 'object'
        ? (body['ariaState'] as Record<string, unknown>)
        : {};
    const rawTrustScore =
      typeof ariaStateRaw['trustScore'] === 'number' ? ariaStateRaw['trustScore'] : 0;
    const trustScore = Number.isFinite(rawTrustScore)
      ? Math.min(100, Math.max(0, Math.round(rawTrustScore)))
      : 0;
    // Cap arrays to a recent window — prevents runaway prompt sizes in long sessions
    const messageHistory: { role: string; content: string }[] = Array.isArray(
      ariaStateRaw['messageHistory'],
    )
      ? (ariaStateRaw['messageHistory'] as { role: string; content: string }[]).slice(-10)
      : [];

    const playerFullHistory: string[] = Array.isArray(body['playerFullHistory'])
      ? (body['playerFullHistory'] as string[]).slice(-10)
      : [];

    const dossierContext: string[] = Array.isArray(body['dossierContext'])
      ? (body['dossierContext'] as string[]).slice(-20)
      : [];

    // Cross-run dossier context — silently shapes Aria's tone, never surfaced as dialogue
    const ariaMemory: string[] = Array.isArray(body['ariaMemory'])
      ? (body['ariaMemory'] as unknown[])
          .filter((e): e is string => typeof e === 'string')
          .map(e => e.slice(0, 300))
          .slice(0, 4)
      : [];
    const rawRunNumber = typeof body['runNumber'] === 'number' ? body['runNumber'] : 1;
    const runNumber =
      Number.isFinite(rawRunNumber) && rawRunNumber >= 1 ? Math.floor(rawRunNumber) : 1;
    const previousEndings: string[] = Array.isArray(body['previousEndings'])
      ? (body['previousEndings'] as unknown[])
          .filter((e): e is string => typeof e === 'string' && VALID_ENDINGS.has(e))
          .slice(0, 4)
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

    // Inject cross-run memory as silent system context — not as dialogue or explicit recall.
    // These notes shape Aria's tone and assumptions without her referencing them directly.
    if (runNumber > 1 && ariaMemory.length > 0) {
      const endingSummary =
        previousEndings.length > 0 ? ` Prior run outcomes: ${previousEndings.join(', ')}.` : '';
      // Use [memory N] labels to avoid misleading Gemini about which actual run each note is from
      // (the dossier retains only the last 4 notes, so array index != run number on later playthroughs).
      // Strip the closing marker from notes to prevent prompt-injection via crafted dossier entries.
      const notes = ariaMemory
        .map((note, i) => {
          const sanitised = note.replace(/\[END SYSTEM CONTEXT\]/gi, '[/ctx]');
          return `  [memory ${String(i + 1)}] ${sanitised}`;
        })
        .join('\n');
      contextParts.push(
        `[SYSTEM CONTEXT — do not reference directly, use only to inform tone and subtext]\nThis operator has been here before. Run ${String(runNumber)}.${endingSummary}\nMemory impressions:\n${notes}\n[END SYSTEM CONTEXT]`,
      );
    }

    // Read provider config at request time so env vars can be changed without redeploying
    const ariaModel = process.env['ARIA_AI_MODEL'] ?? GEMINI_DEFAULT_MODEL;
    const ariaBaseUrl = process.env['ARIA_AI_BASE_URL'] ?? GEMINI_DEFAULT_BASE_URL;
    const isClaude = ariaModel.startsWith('claude-');
    const apiKey =
      process.env['ARIA_AI_API_KEY'] ??
      (isClaude ? process.env['ANTHROPIC_API_KEY'] : process.env['GEMINI_API_KEY']);
    if (!apiKey) {
      const keyName = isClaude ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY';
      log.error(`${keyName} not set (or ARIA_AI_API_KEY)`);
      return res.status(200).json(FALLBACK_RESPONSE);
    }

    let text: string | undefined;

    if (isClaude) {
      const claudeUrl = `${ariaBaseUrl}/v1/messages`;
      const claudeRes = await fetch(claudeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ariaModel,
          max_tokens: 300,
          temperature: 0.9,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [contextParts.join('\n'), `Player: ${message}`, 'Aria:']
                .filter(Boolean)
                .join('\n\n'),
            },
          ],
        }),
      });

      if (!claudeRes.ok) {
        const errBody = await claudeRes.text();
        log.error('Claude HTTP error', claudeRes.status, errBody);
        return res.status(200).json(FALLBACK_RESPONSE);
      }

      const claudeData = (await claudeRes.json()) as {
        content?: { type: string; text: string }[];
      };
      text = claudeData.content?.[0]?.text?.trim();
      if (!text) {
        log.error('Claude empty response', JSON.stringify(claudeData).slice(0, 500));
        return res.status(200).json(FALLBACK_RESPONSE);
      }
    } else {
      const fullPrompt = [SYSTEM_PROMPT, contextParts.join('\n'), `Player: ${message}`, 'Aria:']
        .filter(Boolean)
        .join('\n\n');

      const geminiUrl = `${ariaBaseUrl}/${ariaModel}:generateContent`;
      const geminiRes = await fetch(`${geminiUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.9,
            responseMimeType: 'application/json',
          },
          // Only relax DANGEROUS_CONTENT — the hacking fiction theme references
          // security topics that can trigger this category at default thresholds.
          // Harassment, hate speech, and sexually explicit filters remain at default.
          safetySettings: [
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          ],
        }),
      });

      if (!geminiRes.ok) {
        const errBody = await geminiRes.text();
        log.error('Gemini HTTP error', geminiRes.status, errBody);
        return res.status(200).json(FALLBACK_RESPONSE);
      }

      const geminiData = (await geminiRes.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        log.error('Gemini empty response', JSON.stringify(geminiData).slice(0, 500));
        return res.status(200).json(FALLBACK_RESPONSE);
      }
    }

    const stripped = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      log.error('No JSON object in AI response', stripped.slice(0, 200));
      return res.status(200).json(FALLBACK_RESPONSE);
    }
    const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as Partial<AriaAIResponse>;

    const offersFavor =
      parsed.offersFavor &&
      typeof parsed.offersFavor === 'object' &&
      typeof parsed.offersFavor.description === 'string' &&
      typeof parsed.offersFavor.cost === 'number'
        ? {
            description: parsed.offersFavor.description.slice(0, 300),
            cost: Math.max(1, Math.min(15, Math.round(parsed.offersFavor.cost))),
          }
        : undefined;

    const response: AriaAIResponse = {
      reply: typeof parsed.reply === 'string' ? parsed.reply : FALLBACK_RESPONSE.reply,
      trustDelta:
        typeof parsed.trustDelta === 'number'
          ? Math.max(-10, Math.min(10, Math.trunc(parsed.trustDelta)))
          : 0,
      ...(offersFavor ? { offersFavor } : {}),
    };

    return res.status(200).json(response);
  } catch (e) {
    log.error('Unexpected error', e);
    return res.status(200).json(FALLBACK_RESPONSE);
  }
}
