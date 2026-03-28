/**
 * POST /api/world
 * Proxies to Groq (World AI handler).
 *
 * Request body:
 *   { prompt: string, context?: string }
 *
 * Response:
 *   200 { response: string }
 *   400 { error: string }          — malformed payload
 *   200 { response: string }       — fallback when Groq is unavailable
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ValidationError, requireObject, requireString } from './_lib/validate.js'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const FALLBACK_RESPONSE =
  '[World AI unavailable — operating in offline mode. Try basic commands.]'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Validate payload
  let prompt: string
  try {
    const body = requireObject(req.body, 'Request body')
    prompt = requireString(body['prompt'], 'prompt')
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message })
    }
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const apiKey = process.env['GROQ_API_KEY']
  if (!apiKey) {
    return res.status(200).json({ response: FALLBACK_RESPONSE })
  }

  try {
    const context = typeof req.body?.context === 'string' ? req.body.context : ''
    const messages = [
      {
        role: 'system',
        content:
          'You are the World AI for a hacking terminal game called NEXUS. ' +
          'Respond in character: terse, technical, no pleasantries. ' +
          (context ? `Context: ${context}` : ''),
      },
      { role: 'user', content: prompt },
    ]

    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages,
        max_tokens: 256,
        temperature: 0.7,
      }),
    })

    if (!groqRes.ok) {
      return res.status(200).json({ response: FALLBACK_RESPONSE })
    }

    const data = (await groqRes.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = data.choices?.[0]?.message?.content?.trim() ?? FALLBACK_RESPONSE

    return res.status(200).json({ response: text })
  } catch {
    return res.status(200).json({ response: FALLBACK_RESPONSE })
  }
}
