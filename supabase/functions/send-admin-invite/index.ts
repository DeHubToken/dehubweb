// Sends the admin-panel invite email through Lovable's managed email API.
//
// Called server-to-server by the NestJS backend when an admin invite is
// created. Authenticated with the ADMIN_INVITE_EMAIL_SECRET shared secret
// (x-invite-secret header) — not a Supabase JWT, so verify_jwt is off in
// config.toml. Sent as noreply@notify.dehub.io.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const SITE_NAME = 'DeHub'
// Only links into the admin panel's onboarding page may be mailed. Even with
// a leaked secret this function must not become an open phishing relay.
const ALLOWED_LINK_PREFIX = 'https://godmode.dehub.io/admin/onboarding?token='
const INVITE_EXPIRES_DAYS = 7

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MODERATOR: 'Moderator',
  VIEWER: 'Viewer',
}

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

  const secret = Deno.env.get('ADMIN_INVITE_EMAIL_SECRET')
  if (!secret) {
    console.error('ADMIN_INVITE_EMAIL_SECRET not configured')
    return json(500, { error: 'Not configured' })
  }
  if (req.headers.get('x-invite-secret') !== secret) {
    return json(401, { error: 'Unauthorized' })
  }

  let body: { email?: string; role?: string; inviteLink?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const email = (body.email || '').trim().toLowerCase()
  const role = ROLE_LABELS[body.role || ''] || 'Admin'
  const inviteLink = body.inviteLink || ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Invalid email' })
  }
  if (!inviteLink.startsWith(ALLOWED_LINK_PREFIX)) {
    return json(400, { error: 'Invalid invite link' })
  }

  const props = {
    siteName: SITE_NAME,
    role,
    inviteLink,
    expiresInDays: INVITE_EXPIRES_DAYS,
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  async function log(status: string, errorMessage?: string) {
    const { error } = await supabase.from('email_send_log').insert({
      template_name: 'admin_invite',
      recipient_email: email,
      status,
      error_message: errorMessage ?? null,
    })
    if (error) console.error('email_send_log write failed', { code: error.code, message: error.message })
  }

  try {
    const result = await sendTemplateEmail('admin-invite', email, {
      templateData: props,
      idempotencyKey: `admin-invite-${await hash(inviteLink)}`,
    })
    if (!result.sent) {
      await log('suppressed')
      console.log('Admin invite email suppressed')
      return json(200, { success: true, suppressed: true })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email'
    console.error('Failed to send admin invite email', { message })
    await log('failed', message)
    return json(500, { error: 'Failed to send email' })
  }

  await log('sent')
  console.log('Admin invite email sent')
  return json(200, { success: true, sent: true })
})

/** Stable idempotency key from the one-time invite link, without mailing it. */
async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
