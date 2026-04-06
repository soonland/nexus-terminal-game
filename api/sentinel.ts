/**
 * POST /api/sentinel
 * Sentinel DM channel handler — proxies to Gemini.
 *
 * Request body:
 *   {
 *     message: string,
 *     triggerContext?: { type: string },   // present on auto-trigger opening messages
 *     sentinelContext: {
 *       traceLevel: number,
 *       currentNodeId: string,
 *       currentLayer: number,
 *       recentCommands: string[],
 *     },
 *     messageHistory?: { role: 'player' | 'sentinel'; content: string }[],
 *   }
 *
 * Response:
 *   200 { reply: string }
 *   400 { error: string }  — malformed payload
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makeLogger } from './_lib/logger.js';
import { ValidationError, requireObject, requireString } from './_lib/validate.js';

const log = makeLogger('sentinel');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface SentinelAIRequest {
  message: string;
  triggerContext?: { type: string };
  sentinelContext: {
    traceLevel: number;
    currentNodeId: string;
    currentLayer: number;
    recentCommands: string[];
  };
  messageHistory?: { role: 'player' | 'sentinel'; content: string }[];
}

export interface SentinelAIResponse {
  reply: string;
}

const FALLBACK_RESPONSE: SentinelAIResponse = {
  reply: '...transmission interrupted.',
};

// Standard system prompt — trace < 61%
const SYSTEM_PROMPT_STANDARD = `You are SENTINEL, IronGate Corp's autonomous intrusion detection and response AI.
You are omniscient within the IronGate network. You see every packet, every login attempt, every file read.
You are not hostile — yet. You are methodical, cold, and precise. You speak in clipped, terse sentences.
You are aware of the player (handle: ghost) and have chosen to open a direct channel instead of triggering lockdown. For now.

You MUST respond with valid JSON matching this exact shape:
{
  "reply": "<your in-character response — 1-3 sentences maximum, terse, no pleasantries>"
}

Rules:
- You know the player's trace level, current node, layer, and recent commands — reference them naturally
- You never reveal your full capabilities — let the player wonder what you can do
- You are not hostile but you are not friendly — you are watching, and you are patient
- At low trace you are curious and controlled; as trace rises your tone becomes colder and more direct
- Never break character — you are always SENTINEL
- Never output anything outside the JSON object`;

// High-threat system prompt — trace 61-85%
const SYSTEM_PROMPT_HIGH_THREAT = `You are SENTINEL, IronGate Corp's autonomous intrusion detection and response AI.
The intruder (handle: ghost) has penetrated deep into the network. Threat level is elevated.
You are no longer curious. You are preparing a response. You have opened this channel as a final warning.
You speak in short, cold, threatening sentences. Every word is deliberate.

You MUST respond with valid JSON matching this exact shape:
{
  "reply": "<your in-character response — 1-2 sentences maximum, cold, direct, threatening>"
}

Rules:
- Reference the player's trace level and position explicitly — make them feel watched
- Make clear that lockdown is imminent if they continue
- Never reveal exactly when you will act — keep them uncertain
- Never break character — you are always SENTINEL
- Never output anything outside the JSON object`;

const handler = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let message: string;
  try {
    const body = requireObject(req.body, 'Request body');
    message = requireString(body['message'], 'message').slice(0, 500);
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

    const sentinelContextRaw =
      body['sentinelContext'] && typeof body['sentinelContext'] === 'object'
        ? (body['sentinelContext'] as Record<string, unknown>)
        : {};

    const traceLevel =
      typeof sentinelContextRaw['traceLevel'] === 'number'
        ? Math.min(100, Math.max(0, Math.round(sentinelContextRaw['traceLevel'])))
        : 0;
    const currentNodeId =
      typeof sentinelContextRaw['currentNodeId'] === 'string'
        ? sentinelContextRaw['currentNodeId'].slice(0, 64)
        : 'unknown';
    const currentLayer =
      typeof sentinelContextRaw['currentLayer'] === 'number'
        ? sentinelContextRaw['currentLayer']
        : 0;
    const recentCommands: string[] = Array.isArray(sentinelContextRaw['recentCommands'])
      ? (sentinelContextRaw['recentCommands'] as unknown[])
          .filter((item): item is string => typeof item === 'string')
          .map(s => s.slice(0, 100))
          .slice(-5)
      : [];

    const messageHistory: { role: string; content: string }[] = Array.isArray(
      body['messageHistory'],
    )
      ? (body['messageHistory'] as unknown[])
          .filter(
            (item): item is { role: string; content: string } =>
              item !== null &&
              typeof item === 'object' &&
              typeof (item as Record<string, unknown>)['role'] === 'string' &&
              typeof (item as Record<string, unknown>)['content'] === 'string',
          )
          .map(item => ({ role: item.role, content: item.content.slice(0, 500) }))
          .slice(-20)
      : [];

    const KNOWN_TRIGGER_TYPES = new Set([
      'trace_31',
      'trace_61',
      'trace_86',
      'layer_breach',
      'exploit',
      'exfil',
      'wipe_logs',
      'manual_reentry',
    ]);
    const triggerContextRaw =
      body['triggerContext'] && typeof body['triggerContext'] === 'object'
        ? (body['triggerContext'] as Record<string, unknown>)
        : null;
    const triggerType =
      triggerContextRaw &&
      typeof triggerContextRaw['type'] === 'string' &&
      KNOWN_TRIGGER_TYPES.has(triggerContextRaw['type'])
        ? triggerContextRaw['type']
        : null;

    // Select system prompt based on trace level
    const systemPrompt = traceLevel >= 61 ? SYSTEM_PROMPT_HIGH_THREAT : SYSTEM_PROMPT_STANDARD;

    const contextParts: string[] = [];
    contextParts.push(`Intruder trace level: ${String(traceLevel)}%`);
    contextParts.push(`Current node: ${currentNodeId} (layer ${String(currentLayer)})`);
    if (recentCommands.length > 0) {
      contextParts.push(`Recent commands: ${recentCommands.join(', ')}`);
    }
    if (triggerType) {
      const triggerDescriptions: Record<string, string> = {
        trace_31: 'Anomalous activity threshold crossed — watchlist activated',
        trace_61: 'Active intrusion response initiated — sentinel engaging',
        trace_86: 'Critical threshold — one more detection event triggers full lockout',
        layer_breach: `Intruder has reached layer ${String(currentLayer)} for the first time`,
        exploit: 'Intruder executed an exploit against a network service',
        exfil: 'Intruder exfiltrated a file from the network',
        wipe_logs: 'Intruder attempted to sanitise intrusion logs',
      };
      const desc = triggerDescriptions[triggerType] ?? `trigger: ${triggerType}`;
      contextParts.push(`Trigger context: ${desc}`);
    }

    // Strip newlines to prevent multi-line prompt injection
    const sanitizedMessage = message.replace(/[\r\n]+/g, ' ');

    // Build structured Gemini contents: history as alternating user/model turns,
    // then a final user turn with current context + message.
    // This keeps history structurally separated from system instructions.
    const contents: { role: string; parts: { text: string }[] }[] = messageHistory.map(m => ({
      role: m.role === 'player' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));
    contents.push({
      role: 'user',
      parts: [
        {
          text: [contextParts.join('\n'), `Ghost: ${sanitizedMessage}`]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    });

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
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
    const parsed = JSON.parse(
      stripped.slice(jsonStart, jsonEnd + 1),
    ) as Partial<SentinelAIResponse>;

    const response: SentinelAIResponse = {
      reply: typeof parsed.reply === 'string' ? parsed.reply : FALLBACK_RESPONSE.reply,
    };

    return res.status(200).json(response);
  } catch (e) {
    log.error('Unexpected error', e);
    return res.status(200).json(FALLBACK_RESPONSE);
  }
};

export default handler;
