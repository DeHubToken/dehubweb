// Terminal email outcomes (bounce, complaint, unsubscribe) delivered by
// Lovable. These writes are notification/record keeping only — Lovable
// enforces suppression server-side at send time.
import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function record(
  eventId: string,
  recipient: string,
  logStatus: 'bounced' | 'complained' | 'suppressed',
  reason: 'bounce' | 'complaint' | 'unsubscribe',
  message: string
) {
  const email = (recipient || '').trim().toLowerCase()
  if (!email) return

  const { error: logError } = await supabase.from('email_send_log').insert({
    template_name: 'system',
    recipient_email: email,
    status: logStatus,
    error_message: message,
  })
  if (logError) {
    console.error('email_send_log write failed', {
      event_id: eventId,
      code: logError.code,
      message: logError.message,
    })
    throw new Error('email_send_log write failed')
  }

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })
  if (suppressError) {
    console.error('suppressed_emails write failed', {
      event_id: eventId,
      code: suppressError.code,
      message: suppressError.message,
    })
    throw new Error('suppressed_emails write failed')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record(event.event_id, event.data.recipient, 'bounced', 'bounce', 'Email bounced')
    },
    'email.complaint': async (event) => {
      await record(
        event.event_id,
        event.data.recipient,
        'complained',
        'complaint',
        'Recipient marked the email as spam'
      )
    },
    'email.unsubscribed': async (event) => {
      await record(
        event.event_id,
        event.data.recipient,
        'suppressed',
        'unsubscribe',
        'Recipient unsubscribed'
      )
    },
  },
})

Deno.serve((req) => handler(req))
