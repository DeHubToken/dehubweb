// Jarvis text-to-speech bridge. Server-to-server only: authenticated with
// JARVIS_TTS_SERVICE_SECRET (x-jarvis-tts-secret header), not a Supabase JWT —
// so verify_jwt is off in config.toml, same as infra-stats.
//
// Falls back to CDN_PURGE_SERVICE_SECRET while the dedicated one is unset. This
// used to read that shared value outright, so the string that flushes the CDN
// also bought unmetered synthesis here — no per-caller cap, no rate limit.
//
// The ElevenLabs API key never leaves this function: it is not logged, echoed
// or shaped into any response.

const VOICE_RE = /^[A-Za-z0-9]{10,40}$/
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb'
const DEFAULT_MODEL = 'eleven_flash_v2_5'

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' })
  }

  // Own secret first, shared one as a fallback until it is provisioned. See
  // the note in cdn-purge.
  const secret = Deno.env.get('JARVIS_TTS_SERVICE_SECRET')
    || Deno.env.get('CDN_PURGE_SERVICE_SECRET')
  if (!secret || req.headers.get('x-jarvis-tts-secret') !== secret) {
    return json(401, { ok: false, error: 'unauthorized' })
  }

  let body: { text?: unknown; voice_id?: unknown; model_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'invalid_json' })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return json(400, { ok: false, error: 'text_required' })
  if (text.length > 500) return json(400, { ok: false, error: 'text_too_long' })

  let voiceId = DEFAULT_VOICE
  if (typeof body.voice_id === 'string' && body.voice_id.length > 0) {
    if (!VOICE_RE.test(body.voice_id)) {
      return json(400, { ok: false, error: 'invalid_voice_id' })
    }
    voiceId = body.voice_id
  }

  let modelId = DEFAULT_MODEL
  if (typeof body.model_id === 'string' && body.model_id.length > 0) {
    if (!body.model_id.startsWith('eleven_')) {
      return json(400, { ok: false, error: 'invalid_model_id' })
    }
    modelId = body.model_id
  }

  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')
  if (!ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not configured')
    return json(500, { ok: false, error: 'not_configured' })
  }

  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, model_id: modelId }),
    })
  } catch (_err) {
    return json(502, { ok: false, error: 'elevenlabs', status: 0, body: 'request failed' })
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    return json(502, {
      ok: false,
      error: 'elevenlabs',
      status: res.status,
      body: detail.slice(0, 200),
    })
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-sample-rate': '24000',
    },
  })
})
