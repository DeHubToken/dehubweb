// Read-only DigitalOcean infrastructure stats: account balance and droplet
// costs. Called server-to-server, authenticated with INFRA_STATS_SERVICE_SECRET
// (x-infra-stats-secret header), not a Supabase JWT — so verify_jwt is off in
// config.toml, same as cdn-purge.
//
// Falls back to CDN_PURGE_SERVICE_SECRET while the dedicated one is unset.
// This used to read that shared value outright, along with jarvis-tts and
// jarvis-stt, so one leaked string reached a CDN flush, this inventory, and
// unmetered speech synthesis and transcription. Set the dedicated secret and
// the fallback stops mattering; drop the fallback once all four are set.
//
// The DO API token never leaves this function: it is not logged, echoed or
// shaped into any response.

const DO_API = 'https://api.digitalocean.com/v2'

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' })
  }

  // Own secret first, shared one as a fallback until it is provisioned. See
  // the note in cdn-purge: four unrelated functions shared one value, so a
  // single leak reached the CDN, the DO inventory and unmetered speech.
  const secret = Deno.env.get('INFRA_STATS_SERVICE_SECRET')
    || Deno.env.get('CDN_PURGE_SERVICE_SECRET')
  if (!secret || req.headers.get('x-infra-stats-secret') !== secret) {
    return json(401, { ok: false, error: 'unauthorized' })
  }

  const rawToken = Deno.env.get('DIGITAL_OCEAN') ?? Deno.env.get('digitalocean')
  if (!rawToken) {
    console.error('Neither DIGITAL_OCEAN nor digitalocean secret is configured')
    return json(500, { ok: false, error: 'not_configured' })
  }
  const doToken = rawToken
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/[\r\n]/g, '')

  const headers = {
    Authorization: `Bearer ${doToken}`,
    'Content-Type': 'application/json',
  }

  let balanceRes: Response
  try {
    balanceRes = await fetch(`${DO_API}/customers/my/balance`, { headers })
  } catch (err) {
    console.error('DO balance request failed', err instanceof Error ? err.message : err)
    return json(502, { ok: false, error: 'do_api', status: 0, body: 'request failed' })
  }

  const balanceText = await balanceRes.text()
  if (!balanceRes.ok) {
    return json(502, {
      ok: false,
      error: 'do_api',
      status: balanceRes.status,
      body: balanceText.slice(0, 200),
    })
  }

  let balance: unknown = null
  try {
    balance = JSON.parse(balanceText)
  } catch {
    balance = null
  }

  let droplets:
    | { name: string; region: string | null; size: string | null; priceMonthly: number }[]
    | null = null
  let dropletMonthlyTotal = 0

  try {
    const res = await fetch(`${DO_API}/droplets?per_page=200`, { headers })
    if (res.ok) {
      const data = await res.json()
      const list = Array.isArray(data?.droplets) ? data.droplets : []
      droplets = list.map((d: Record<string, any>) => {
        const priceMonthly = Number(d?.size?.price_monthly ?? 0) || 0
        dropletMonthlyTotal += priceMonthly
        return {
          name: d?.name ?? null,
          region: d?.region?.slug ?? null,
          size: d?.size_slug ?? null,
          priceMonthly,
        }
      })
    } else {
      console.error('DO droplets call returned', res.status)
    }
  } catch (err) {
    console.error('DO droplets request failed', err instanceof Error ? err.message : err)
  }

  return json(200, {
    ok: true,
    balance,
    droplets,
    dropletMonthlyTotal: droplets ? Math.round(dropletMonthlyTotal * 100) / 100 : 0,
  })
})
