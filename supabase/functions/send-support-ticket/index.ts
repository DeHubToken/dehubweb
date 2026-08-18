// Mails a support ticket raised through the DeHub assistant to the dev inbox.
//
// Called server-to-server by the NestJS backend when the assistant files a
// ticket for a signed-in user. Authenticated with the SUPPORT_TICKET_SECRET
// shared secret (x-support-secret header) — not a Supabase JWT, so verify_jwt
// is off in config.toml. The mail rides the same pipeline as auth and admin
// invite email: enqueue_email → process-email-queue → Lovable/Mailgun, sent as
// noreply@notify.dehub.io.
//
// The recipient is a constant. Everything in the body comes from a user talking
// to a chatbot, so an addressable `to` field would turn a leaked secret into an
// open relay — the same reason send-admin-invite pins its link prefix.
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SupportTicketEmail } from '../_shared/email-templates/support-ticket.tsx'

const SITE_NAME = 'DeHub'
const FROM_DOMAIN = 'notify.dehub.io'
const SENDER_DOMAIN = 'notify.dehub.io'
const SUPPORT_INBOX = 'dev@dehub.io'

// Caps mirror the backend's own, so a request that somehow skips them cannot
// enqueue an unbounded payload.
const LIMITS = {
  ref: 32,
  subject: 160,
  description: 4000,
  steps: 2000,
  url: 500,
  short: 64,
  diagnosticsKeys: 20,
  diagnosticValue: 500,
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function optional(value: unknown, max: number): string | null {
  const out = str(value, max).trim()
  return out || null
}

/** Flatten the diagnostics blob to printable pairs, dropping anything odd. */
function diagnostics(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const entries = Object.entries(input as Record<string, unknown>).slice(0, LIMITS.diagnosticsKeys)
  if (!entries.length) return null
  const out: Record<string, string> = {}
  for (const [key, value] of entries) {
    out[key.slice(0, LIMITS.short)] = String(
      value === null || value === undefined ? '' : value,
    ).slice(0, LIMITS.diagnosticValue)
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const secret = Deno.env.get('SUPPORT_TICKET_SECRET')
  if (!secret) {
    console.error('SUPPORT_TICKET_SECRET not configured')
    return json(500, { error: 'Not configured' })
  }
  if (req.headers.get('x-support-secret') !== secret) {
    return json(401, { error: 'Unauthorized' })
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const reference = str(body.ref, LIMITS.ref).trim()
  const subject = str(body.subject, LIMITS.subject).trim()
  const description = str(body.description, LIMITS.description).trim()
  const address = str(body.reporter?.address, LIMITS.short).trim()

  if (!reference || !subject || !description || !address) {
    return json(400, { error: 'ref, subject, description and reporter.address are required' })
  }

  const reporterEmail = optional(body.reporter?.email, 254)
  const props = {
    reference,
    subject,
    description,
    category: str(body.category, LIMITS.short) || 'other',
    severity: str(body.severity, LIMITS.short) || 'normal',
    platform: str(body.platform, LIMITS.short) || 'unknown',
    stepsToReproduce: optional(body.stepsToReproduce, LIMITS.steps),
    relatedUrl: optional(body.relatedUrl, LIMITS.url),
    diagnostics: diagnostics(body.diagnostics),
    reporter: {
      address,
      username: optional(body.reporter?.username, LIMITS.short),
      displayName: optional(body.reporter?.displayName, LIMITS.short),
      email: reporterEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail) ? reporterEmail : null,
    },
    createdAt: optional(body.createdAt, LIMITS.short),
  }

  const html = await renderAsync(React.createElement(SupportTicketEmail, props))
  const text = await renderAsync(React.createElement(SupportTicketEmail, props), {
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
    template_name: 'support_ticket',
    recipient_email: SUPPORT_INBOX,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      // The ticket reference is the idempotency key, so the backend retrying a
      // send after a timeout cannot put the same ticket in the inbox twice.
      idempotency_key: `support-${reference}`,
      to: SUPPORT_INBOX,
      from: `${SITE_NAME} Support <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: `[${reference}] ${props.severity === 'urgent' ? 'URGENT · ' : ''}${subject}`,
      html,
      text,
      purpose: 'transactional',
      label: 'support_ticket',
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue support ticket email', { error: enqueueError, reference })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'support_ticket',
      recipient_email: SUPPORT_INBOX,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    return json(500, { error: 'Failed to enqueue email' })
  }

  console.log('Support ticket email enqueued', { reference, severity: props.severity })
  return json(200, { success: true, queued: true })
})
