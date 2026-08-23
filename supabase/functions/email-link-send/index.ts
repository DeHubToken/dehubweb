// Mails the verification code for email login linking through the shared
// email queue.
//
// Called server-to-server by the NestJS backend (POST account/email-link/
// request) when a wallet-login account asks to attach an email address.
// Authenticated with the EMAIL_LINK_SERVICE_SECRET shared secret
// (x-email-link-secret header) — not a Supabase JWT, so verify_jwt is off in
// config.toml. The code was already generated, hashed and rate-limited in the
// backend's Mongo; this function is only the delivery leg, so it validates
// just enough to refuse garbage and rides the auth pipeline:
// enqueue_email → process-email-queue → Lovable/Mailgun, sent as
// noreply@notify.dehub.io.
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { EmailLinkCodeEmail } from '../_shared/email-templates/email-link-code.tsx'

const SITE_NAME = 'DeHub'
const FROM_DOMAIN = 'notify.dehub.io'
const SENDER_DOMAIN = 'notify.dehub.io'

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

  const props = { code }
  const html = await renderAsync(React.createElement(EmailLinkCodeEmail, props))
  const text = await renderAsync(React.createElement(EmailLinkCodeEmail, props), {
    plainText: true,
  })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const messageId = crypto.randomUUID()

  // Log pending BEFORE enqueue so we have a record even if enqueue crashes
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: 'email_link_code',
    recipient_email: to,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'auth_emails',
    payload: {
      message_id: messageId,
      idempotency_key: messageId,
      to,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: `Your ${SITE_NAME} sign-in code`,
      html,
      text,
      purpose: 'transactional',
      label: 'email_link_code',
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue email link code', { error: enqueueError, to })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'email_link_code',
      recipient_email: to,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    return json(500, { error: 'Failed to enqueue email' })
  }

  console.log('Email link code enqueued', { to })
  return json(200, { success: true, queued: true })
})
