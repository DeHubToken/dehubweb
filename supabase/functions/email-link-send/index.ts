// Mails the verification code for email login linking through Lovable's
// managed email API.
//
// Called server-to-server by the NestJS backend (POST account/email-link/
// request) when a wallet-login account asks to attach an email address.
// Authenticated with the EMAIL_LINK_SERVICE_SECRET shared secret
// (x-email-link-secret header) — not a Supabase JWT, so verify_jwt is off in
// config.toml. The code was already generated, hashed and rate-limited in the
// backend's Mongo; this function is only the delivery leg, sent as
// noreply@notify.dehub.io.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

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

  let body: { to?: string; code?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const to = (body.to || '').trim().toLowerCase()
  const code = (body.code || '').trim()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json(400, { error: 'Invalid email' })
  }
  if (!/^\d{6}$/.test(code)) {
    return json(400, { error: 'Invalid code' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  async function log(status: string, errorMessage?: string) {
    const { error } = await supabase.from('email_send_log').insert({
      template_name: 'email_link_code',
      recipient_email: to,
      status,
      error_message: errorMessage ?? null,
    })
    if (error) console.error('email_send_log write failed', { code: error.code, message: error.message })
  }

  try {
    const result = await sendTemplateEmail('email-link-code', to, {
      templateData: { code },
      idempotencyKey: crypto.randomUUID(),
    })
    if (!result.sent) {
      await log('suppressed')
      console.log('Email link code suppressed')
      return json(200, { success: true, suppressed: true })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email'
    console.error('Failed to send email link code', { message })
    await log('failed', message)
    return json(500, { error: 'Failed to send email' })
  }

  await log('sent')
  console.log('Email link code sent')
  return json(200, { success: true, sent: true })
})
