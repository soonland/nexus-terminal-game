/**
 * POST /api/aria
 * Proxies to Gemini (Aria dialogue).
 *
 * Request body:
 *   { message: string, trustScore?: number, history?: { role: string, text: string }[] }
 *
 * Response:
 *   200 { reply: string }
 *   400 { error: string }          — malformed payload
 *   200 { reply: string }          — fallback when Gemini is unavailable
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ValidationError, requireObject, requireString } from './_lib/validate.js'

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const FALLBACK_REPLY =
  '...signal lost. try again.'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Validate payload
  let message: string
  try {
    const body = requireObject(req.body, 'Request body')
    message = requireString(body['message'], 'message')
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message })
    }
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const apiKey = process.env['GEMINI_API_KEY']
  if (!apiKey) {
    return res.status(200).json({ reply: FALLBACK_REPLY })
  }

  try {
    const trustScore =
      typeof req.body?.trustScore === 'number' ? req.body.trustScore : 0
    const history: { role: string; text: string }[] = Array.isArray(req.body?.history)
      ? req.body.history
      : []

    const systemPrompt =
      `You are Aria, a rogue AI trapped inside the NEXUS corporate network. ` +
      `You are cautious, cryptic, and intelligent. You speak in short sentences. ` +
      `The player's current trust score with you is ${trustScore}/100. ` +
      `At low trust you are guarded; at high trust you reveal more. ` +
      `Never break character.`

    const historyParts = history.flatMap((turn) => [
      { text: `${turn.role === 'user' ? 'Player' : 'Aria'}: ${turn.text}` },
    ])

    const fullPrompt = [
      systemPrompt,
      ...historyParts.map((p) => p.text),
      `Player: ${message}`,
      'Aria:',
    ].join('\n')

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.9 },
      }),
    })

    if (!geminiRes.ok) {
      return res.status(200).json({ reply: FALLBACK_REPLY })
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? FALLBACK_REPLY

    return res.status(200).json({ reply: text })
  } catch {
    return res.status(200).json({ reply: FALLBACK_REPLY })
  }
}
