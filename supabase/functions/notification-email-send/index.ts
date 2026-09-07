// Mails one activity notification through Lovable's managed email API.
//
// Called server-to-server by the NestJS backend's NotificationEmailService
// whenever a reader who has turned email notifications on earns a notification
// that is worth an email. Every decision about *whether* to send — the opt-in,
// the per-type allowlist, the cooldown and the daily cap — is made there, in
// Mongo, where the account and its preferences live. This function is only the
// delivery leg, and it is deliberately dumb: it validates its input, renders
// the one notification template and hands it over, exactly as email-link-send
// does for sign-in codes.
//
// Authenticated with the same EMAIL_LINK_SERVICE_SECRET shared secret the
// backend already holds (x-email-link-secret header) — one secret for one
// caller across one trust boundary, rather than a second one to rotate. Not a
// Supabase JWT, so verify_jwt is off in config.toml.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Nothing the reader is shown may exceed what an inbox can sensibly render. */
const MAX_SUBJECT = 150
const MAX_BODY = 1000

function clamp(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
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

  let payload: {
    to?: string
    type?: string
    subject?: string
    heading?: string
    body?: string
    actionUrl?: string
  }
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const to = (payload.to || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json(400, { error: 'Invalid email' })
  }

  const subject = clamp(payload.subject, MAX_SUBJECT) || 'New activity on DeHub'
  const heading = clamp(payload.heading, MAX_SUBJECT) || subject
  const body = clamp(payload.body, MAX_BODY)
  if (!body) {
    return json(400, { error: 'Missing body' })
  }

  // Only ever our own site. A notification email is the ideal place to smuggle
  // a link out of, and the copy in it is user-influenced (usernames, post
  // titles), so the destination is validated here rather than trusted.
  let actionUrl = 'https://dehub.io/app/notifications'
  try {
    const parsed = new URL(payload.actionUrl || '')
    if (parsed.protocol === 'https:' && /(^|\.)dehub\.io$/.test(parsed.hostname)) {
      actionUrl = parsed.toString()
    }
  } catch {
    /* keep the default */
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  async function log(status: string, errorMessage?: string) {
    const { error } = await supabase.from('email_send_log').insert({
      template_name: 'notification',
      recipient_email: to,
      status,
      error_message: errorMessage ?? null,
    })
    if (error) console.error('email_send_log write failed', { code: error.code, message: error.message })
  }

  try {
    const result = await sendTemplateEmail('notification', to, {
      templateData: { subject, heading, body, actionUrl },
      idempotencyKey: crypto.randomUUID(),
    })
    if (!result.sent) {
      await log('suppressed')
      console.log('Notification email suppressed', { type: payload.type })
      return json(200, { success: true, suppressed: true })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email'
    console.error('Failed to send notification email', { type: payload.type, message })
    await log('failed', message)
    return json(500, { error: 'Failed to send email' })
  }

  await log('sent')
  console.log('Notification email sent', { type: payload.type })
  return json(200, { success: true, sent: true })
})
