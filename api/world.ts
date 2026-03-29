/**
 * POST /api/world
 * World AI handler — proxies to Groq and returns structured game actions.
 *
 * Request body (§10.1 contract):
 *   {
 *     command: string,
 *     currentNode: { id, ip, label, layer, accessLevel, services[], files[] },
 *     playerState: { handle, trace, charges, tools[] },
 *     recentCommands: string[],
 *     turnCount: number,
 *   }
 *
 * Response:
 *   200 {
 *     narrative: string,
 *     traceChange: number,
 *     accessGranted: boolean,
 *     newAccessLevel: 'none' | 'user' | 'admin' | 'root' | null,
 *     flagsSet: Record<string, boolean>,
 *     nodesUnlocked: string[],
 *     isUnknown: boolean,
 *   }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ValidationError, requireObject, requireString } from './_lib/validate.js';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface WorldAIResponse {
  narrative: string;
  traceChange: number;
  accessGranted: boolean;
  newAccessLevel: 'none' | 'user' | 'admin' | 'root' | null;
  flagsSet: Record<string, boolean>;
  nodesUnlocked: string[];
  isUnknown: boolean;
}

const FALLBACK_RESPONSE: WorldAIResponse = {
  narrative: '[World AI unavailable — operating in offline mode. Try basic commands.]',
  traceChange: 0,
  accessGranted: false,
  newAccessLevel: null,
  flagsSet: {},
  nodesUnlocked: [],
  isUnknown: true,
};

const SYSTEM_PROMPT = `You are the World AI for a hacking terminal game called NEXUS.
The player is a hacker navigating a corporate network. You interpret freeform commands that the engine does not handle.

You MUST respond with valid JSON matching this exact shape:
{
  "narrative": "<1-3 terse sentences in character — technical, no pleasantries>",
  "traceChange": <integer 0-5, how much this action increases trace detection>,
  "accessGranted": <boolean, true only if the action narratively grants access>,
  "newAccessLevel": <"user"|"admin"|"root"|null — only set if accessGranted is true>,
  "flagsSet": <object of string→boolean game flags set by this action, or {}>,
  "nodesUnlocked": <array of node IDs that become reachable, or []>,
  "isUnknown": <boolean, true if the command is completely nonsensical in context>
}

Rules:
- Be conservative: only grant access when the narrative clearly earns it (e.g. social engineering a weak password, finding credentials on the node)
- Never grant admin or root access unless the node design supports it and the action is specific
- Trace costs should reflect operational noise: passive observation = 0-1, active probing = 2-3, aggressive = 4-5
- Keep narrative terse and technical. No "Sure!" or "I can help with that."
- If the command is nonsensical or impossible in context, set isUnknown: true and explain briefly in narrative
- Do not output anything outside the JSON object`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let command: string;
  try {
    const body = requireObject(req.body, 'Request body');
    command = requireString(body['command'], 'command');
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    /* v8 ignore start */
    return res.status(400).json({ error: 'Invalid request body' });
    /* v8 ignore stop */
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error('[world] GEMINI_API_KEY not set');
    return res.status(200).json(FALLBACK_RESPONSE);
  }

  try {
    const body = req.body as Record<string, unknown>;
    const contextParts: string[] = [];

    if (body['currentNode']) {
      const n = body['currentNode'] as Record<string, unknown>;
      contextParts.push(
        `Current node: ${String(n['label'])} (${String(n['ip'])}, layer ${String(n['layer'])}, access=${String(n['accessLevel'])})`,
      );
      if (Array.isArray(n['services']) && n['services'].length > 0) {
        const svcNames = (n['services'] as Array<Record<string, unknown>>)
          .map(s => String(s['name']))
          .join(', ');
        contextParts.push(`Services: ${svcNames}`);
      }
      if (Array.isArray(n['files']) && n['files'].length > 0) {
        const fileNames = (n['files'] as Array<Record<string, unknown>>)
          .map(f => String(f['name']))
          .join(', ');
        contextParts.push(`Files: ${fileNames}`);
      }
    }

    if (body['playerState']) {
      const p = body['playerState'] as Record<string, unknown>;
      contextParts.push(
        `Player: ${String(p['handle'])}, trace=${String(p['trace'])}%, charges=${String(p['charges'])}`,
      );
      if (Array.isArray(p['tools']) && p['tools'].length > 0) {
        const toolIds = (p['tools'] as Array<Record<string, unknown>>)
          .map(t => String(t['id']))
          .join(', ');
        contextParts.push(`Tools: ${toolIds}`);
      }
    }

    if (Array.isArray(body['recentCommands']) && body['recentCommands'].length > 0) {
      contextParts.push(`Recent commands: ${(body['recentCommands'] as string[]).join(', ')}`);
    }

    if (typeof body['turnCount'] === 'number') {
      contextParts.push(`Turn: ${String(body['turnCount'])}`);
    }

    const fullPrompt = [
      SYSTEM_PROMPT,
      contextParts.length > 0 ? contextParts.join('\n') : '',
      `Command: ${command}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 0.7,
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
      console.error('[world] Gemini HTTP error', geminiRes.status, errBody);
      return res.status(200).json(FALLBACK_RESPONSE);
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      console.error('[world] Gemini empty response', JSON.stringify(data).slice(0, 500));
      return res.status(200).json(FALLBACK_RESPONSE);
    }

    const parsed = JSON.parse(text) as Partial<WorldAIResponse>;

    const response: WorldAIResponse = {
      narrative:
        typeof parsed.narrative === 'string' ? parsed.narrative : FALLBACK_RESPONSE.narrative,
      traceChange:
        typeof parsed.traceChange === 'number' ? Math.max(0, Math.min(5, parsed.traceChange)) : 0,
      accessGranted: typeof parsed.accessGranted === 'boolean' ? parsed.accessGranted : false,
      newAccessLevel: parsed.accessGranted && parsed.newAccessLevel ? parsed.newAccessLevel : null,
      flagsSet: parsed.flagsSet && typeof parsed.flagsSet === 'object' ? parsed.flagsSet : {},
      nodesUnlocked: Array.isArray(parsed.nodesUnlocked) ? parsed.nodesUnlocked : [],
      isUnknown: typeof parsed.isUnknown === 'boolean' ? parsed.isUnknown : false,
    };

    return res.status(200).json(response);
  } catch (e) {
    console.error('[world] Unexpected error', e);
    return res.status(200).json(FALLBACK_RESPONSE);
  }
}
