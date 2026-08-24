// Purge paths from the DigitalOcean Spaces CDN edge.
//
// WHY THIS EXISTS
// Bucket objects are public-read and the edge honours whatever Cache-Control
// header an object carried WHEN THE EDGE CACHED IT. The back catalogue spent
// months being uploaded with `max-age=31536000, immutable`, so even after
// every object's origin metadata was rewritten to 24 hours, PoPs that were
// already holding a copy keep serving the old header until it expires — up to
// a year out. Deleting a post does not touch that copy. This function is the
// only thing that can: a purge through the DO API evicts the edge copy, and
// the next fetch picks up the corrected header from origin.
//
// Called server-to-server (the NestJS backend's delete paths, or an operator
// by hand), authenticated with the CDN_PURGE_SERVICE_SECRET shared secret
// (x-cdn-purge-secret header) — not a Supabase JWT, so verify_jwt is off in
// config.toml. Same pattern as email-link-send. The DO API token lives only
// in this project's secrets (name: `digitalocean`) and never leaves it.
//
// POST body: { "files": ["images/123.jpg", "videos/123.mp4"] }
//   or       { "files": ["*"] }   to flush the whole endpoint.
// Empty/absent files defaults to ["*"].
//
// DO rate-limits purges (roughly 50 files per 20 seconds per endpoint), so
// requests are capped at 50 paths; callers with more should batch.

const DO_API = 'https://api.digitalocean.com/v2'
const BUCKET_HINT = 'dehubcdn'
const MAX_FILES = 50

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const secret = Deno.env.get('CDN_PURGE_SERVICE_SECRET')
  if (!secret) {
    console.error('CDN_PURGE_SERVICE_SECRET not configured')
    return json(500, { error: 'Not configured' })
  }
  if (req.headers.get('x-cdn-purge-secret') !== secret) {
    return json(401, { error: 'Unauthorized' })
  }

  // Sanitize before use. Secrets pasted from a Windows shell arrive wearing
  // stray whitespace, carriage returns or their own quotes — the repo's
  // cloudflare_apitoken was exactly this, 51 characters of non-token material
  // that Cloudflare refused with "Invalid format for Authorization header".
  const rawToken = Deno.env.get('digitalocean')
  if (!rawToken) {
    console.error('digitalocean secret not configured')
    return json(500, { error: 'DO token not configured' })
  }
  const doToken = rawToken
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/[\r\n]/g, '')

  /**
   * Shape of the stored token for a 401 diagnosis — everything about it
   * EXCEPT its value. `dop_v1_` prefixes a DO personal access token; a Spaces
   * access key is ~20 upper-case characters and cannot call the DO API at all,
   * which is the likeliest mix-up for a secret simply named "digitalocean".
   */
  const tokenShape = () => ({
    length: doToken.length,
    rawLength: rawToken.length,
    looksLikeApiToken: /^dop_v1_[0-9a-f]{64}$/.test(doToken),
    looksLikeSpacesKey: /^[A-Z0-9]{18,24}$/.test(doToken),
    hadWrapping: rawToken !== doToken,
  })

  let files: string[] = ['*']
  try {
    const body = await req.json().catch(() => ({}))
    if (Array.isArray(body?.files) && body.files.length > 0) {
      files = body.files
        .filter((f: unknown): f is string => typeof f === 'string' && f.length > 0)
        // Leading slashes make DO match nothing while reporting success.
        .map((f: string) => f.replace(/^\/+/, ''))
    }
  } catch {
    /* default to full purge */
  }
  if (files.length === 0) files = ['*']
  if (files.length > MAX_FILES) {
    return json(400, {
      error: `At most ${MAX_FILES} paths per request — DO rate-limits purges. Batch the rest.`,
      received: files.length,
    })
  }

  const auth = { Authorization: `Bearer ${doToken}` }

  // Resolve the CDN endpoint id from the token's own account rather than
  // hard-coding it — ids change if the endpoint is ever recreated, and the
  // token can see exactly the endpoints it may purge.
  const listRes = await fetch(`${DO_API}/cdn/endpoints`, { headers: auth })
  if (!listRes.ok) {
    const detail = await listRes.text().catch(() => '')
    console.error('DO endpoint list failed', listRes.status, detail.slice(0, 300))
    return json(502, {
      error: 'Could not list CDN endpoints',
      status: listRes.status,
      // On a 401 the caller needs to know WHAT is stored without seeing it.
      ...(listRes.status === 401 && { tokenShape: tokenShape() }),
    })
  }
  const listBody = await listRes.json()
  const endpoints: Array<{ id: string; origin: string; endpoint: string }> =
    listBody?.endpoints ?? []
  const target = endpoints.find((e) => e.origin?.includes(BUCKET_HINT))
  if (!target) {
    return json(404, {
      error: `No CDN endpoint with origin containing "${BUCKET_HINT}"`,
      origins: endpoints.map((e) => e.origin),
    })
  }

  const purgeRes = await fetch(`${DO_API}/cdn/endpoints/${target.id}/cache`, {
    method: 'DELETE',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })

  // DO answers 204 on success.
  if (purgeRes.status !== 204) {
    const detail = await purgeRes.text().catch(() => '')
    console.error('DO purge failed', purgeRes.status, detail.slice(0, 300))
    return json(502, { error: 'Purge failed', status: purgeRes.status })
  }

  console.log(`Purged ${files.length === 1 && files[0] === '*' ? 'ALL' : files.length} path(s) from ${target.endpoint}`)
  return json(200, { ok: true, endpoint: target.endpoint, purged: files })
})
