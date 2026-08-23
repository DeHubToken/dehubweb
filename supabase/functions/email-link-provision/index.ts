// Resolves (or creates) the Supabase identity behind an email address for
// email login linking.
//
// Called server-to-server by the NestJS backend during POST
// account/email-link/confirm, after the 6-digit code has already been
// verified in Mongo. Authenticated with the EMAIL_LINK_SERVICE_SECRET shared
// secret (x-email-link-secret header) — not a Supabase JWT, so verify_jwt is
// off in config.toml.
//
// The backend owns all policy: exclusivity checks against Mongo accounts,
// what gets written to web3AuthMeta. This function answers one question —
// "which auth.users row does this email belong to?" — creating the row when
// nobody has it yet. The created user intentionally gets NO password, so it
// cannot sign in through any path except the Supabase-session exchange the
// backend performs with a real emailed code.
//
// createUser-first rather than listUsers-first: the happy path (fresh email)
// is one call. The 422 "already registered" fallback paginates listUsers by
// email match — capped, because an unbounded scan of auth.users on every
// confirm would be its own DoS.
import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_LOOKUP_PAGES = 20 // 20 pages × 50 = 1000 users scanned before giving up

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

  const secret = Deno.env.get('EMAIL_LINK_SERVICE_SECRET')
  if (!secret) {
    console.error('EMAIL_LINK_SERVICE_SECRET not configured')
    return json(500, { error: 'Not configured' })
  }
  if (req.headers.get('x-email-link-secret') !== secret) {
    return json(401, { error: 'Unauthorized' })
  }

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const email = (body.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Invalid email' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const created = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  })

  if (!created.error && created.data?.user) {
    console.log('email-link-provision: created identity', { email })
    return json(200, { userId: created.data.user.id, existed: false })
  }

  // Anything other than "email taken" is a real failure — don't fall through.
  if (!/already|registered|exists/i.test(created.error?.message || '')) {
    console.error('email-link-provision: createUser failed', {
      message: created.error?.message,
      status: created.error?.status,
      email,
    })
    return json(502, { error: 'Provisioning failed' })
  }

  // Identity exists — find it. listUsers paginates newest-first; a genuinely
  // old account may sit deep, hence the page cap and the eventual failure.
  let foundId: string | null = null
  for (let page = 1; page <= MAX_LOOKUP_PAGES && !foundId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 50,
    })
    if (error) {
      console.error('email-link-provision: listUsers failed', { message: error.message, page })
      return json(502, { error: 'Provisioning failed' })
    }
    const users = data?.users ?? []
    const match = users.find((u) => (u.email || '').toLowerCase() === email)
    if (match) foundId = match.id
    if (users.length < 50) break
  }

  if (!foundId) {
    console.error('email-link-provision: identity claimed but not found', { email })
    return json(502, { error: 'Provisioning failed' })
  }

  console.log('email-link-provision: resolved existing identity', { email })
  return json(200, { userId: foundId, existed: true })
})
