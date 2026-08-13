// Sends the admin-panel invite email through the shared email queue.
//
// Called server-to-server by the NestJS backend when an admin invite is
// created. Authenticated with the ADMIN_INVITE_EMAIL_SECRET shared secret
// (x-invite-secret header) — not a Supabase JWT, so verify_jwt is off in
// config.toml. The mail rides the same pipeline as auth email:
// enqueue_email → process-email-queue → Lovable/Mailgun, sent as
// noreply@notify.dehub.io.
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { AdminInviteEmail } from '../_shared/email-templates/admin-invite.tsx'

const SITE_NAME = 'DeHub'
const FROM_DOMAIN = 'notify.dehub.io'
const SENDER_DOMAIN = 'notify.dehub.io'
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
  const html = await renderAsync(React.createElement(AdminInviteEmail, props))
  const text = await renderAsync(React.createElement(AdminInviteEmail, props), {
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
    template_name: 'admin_invite',
    recipient_email: email,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      idempotency_key: messageId,
      to: email,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: `You've been invited to the ${SITE_NAME} admin panel`,
      html,
      text,
      purpose: 'transactional',
      label: 'admin_invite',
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue admin invite email', { error: enqueueError, email })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'admin_invite',
      recipient_email: email,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    return json(500, { error: 'Failed to enqueue email' })
  }

  console.log('Admin invite email enqueued', { email })
  return json(200, { success: true, queued: true })
})
