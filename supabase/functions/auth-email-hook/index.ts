import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createAuthEmailHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Configuration
const SITE_NAME = "DeHub"
const SENDER_DOMAIN = "notify.dehub.io"
const ROOT_DOMAIN = "dehub.io"
const FROM_DOMAIN = "notify.dehub.io"
const SITE_URL = `https://${ROOT_DOMAIN}`

// Rewrite the backend-hosted confirmation URL into a branded dehub.io link.
// The auth payload gives the long one-time token inside `data.url` as
// `?token=...&type=...`, not always as `token_hash`. We pass that value to the
// app as `token_hash` so /auth/confirm can call verifyOtp() client-side.
// Never expose the raw backend URL in customer-facing email links.
// deno-lint-ignore no-explicit-any
function buildBrandedConfirmationUrl(data: any, fallbackType?: string): string {
  try {
    const sourceUrl = typeof data?.url === 'string' ? new URL(data.url) : null
    const tokenHash =
      data?.token_hash ||
      data?.token_hash_new ||
      sourceUrl?.searchParams.get('token_hash') ||
      sourceUrl?.searchParams.get('token')
    const actionType =
      data?.email_action_type ||
      data?.action_type ||
      sourceUrl?.searchParams.get('type') ||
      fallbackType
    if (!tokenHash || !actionType) return `https://${ROOT_DOMAIN}/auth/confirm?error=missing_link`
    const params = new URLSearchParams({ token_hash: tokenHash, type: actionType })
    // Preserve extra query params from the caller's redirect_to (e.g. the
    // cross-device magic-link `sync` nonce).
    const rt = (data?.redirect_to || sourceUrl?.searchParams.get('redirect_to')) as string | undefined
    if (rt) {
      try {
        const u = new URL(rt)
        u.searchParams.forEach((v, k) => {
          if (k !== 'token_hash' && k !== 'type') params.set(k, v)
        })
      } catch {
        // Ignore invalid redirect values; only the sync nonce matters here.
      }
    }
    return `https://${ROOT_DOMAIN}/auth/confirm?${params.toString()}`
  } catch {
    return `https://${ROOT_DOMAIN}/auth/confirm?error=missing_link`
  }
}

// Template mapping for preview mode
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Sample data for preview mode ONLY (not used in actual email sending).
// URLs are baked in at scaffold time from the project's real data.
// The sample email uses a fixed placeholder (RFC 6761 .test TLD) so the Go backend
// can always find-and-replace it with the actual recipient when sending test emails,
// even if the project's domain has changed since the template was scaffolded.
const SAMPLE_PROJECT_URL = "https://cosmic-echo-hero.lovable.app"
const SAMPLE_EMAIL = "user@example.test"
const SAMPLE_DATA: Record<string, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
    token: '123456',
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
    token: '123456',
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    oldEmail: SAMPLE_EMAIL,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  reauthentication: {
    token: '123456',
  },
}

// Preview endpoint handler - returns rendered HTML without sending email
async function handlePreview(req: Request): Promise<Response> {
  // The file's own list, not a second shorter one. A request header missing
  // from a preflight response makes the browser refuse to send the request at
  // all — no network entry, no function log — so a hand-cut list here is a
  // silently unreachable endpoint waiting to happen.
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const authHeader = req.headers.get('Authorization')

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type: string
  try {
    const body = await req.json()
    type = body.type
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]

  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sampleData = SAMPLE_DATA[type] || {}
  const html = await renderAsync(React.createElement(EmailTemplate, sampleData))

  return new Response(html, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// The SDK handler owns verification, dispatch, and retry semantics; this file
// owns only the email decisions: subjects, templates, and per-type props.
const handler = createAuthEmailHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
  senderDomain: SENDER_DOMAIN,
  sendUrl: Deno.env.get('LOVABLE_SEND_URL'),
  emails: {
    signup: {
      subject: 'Confirm your email',
      render: (data) =>
        React.createElement(SignupEmail, {
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          recipient: data.email,
          confirmationUrl: buildBrandedConfirmationUrl(data, 'signup'),
          token: data.token,
        }),
    },
    invite: {
      subject: "You've been invited",
      render: (data) =>
        React.createElement(InviteEmail, {
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          confirmationUrl: buildBrandedConfirmationUrl(data, 'invite'),
        }),
    },
    magiclink: {
      subject: 'Your login link',
      render: (data) =>
        React.createElement(MagicLinkEmail, {
          siteName: SITE_NAME,
          confirmationUrl: buildBrandedConfirmationUrl(data, 'magiclink'),
          token: data.token,
        }),
    },
    recovery: {
      subject: 'Reset your password',
      render: (data) =>
        React.createElement(RecoveryEmail, {
          siteName: SITE_NAME,
          confirmationUrl: buildBrandedConfirmationUrl(data, 'recovery'),
        }),
    },
    email_change: {
      subject: 'Confirm your new email',
      render: (data) =>
        React.createElement(EmailChangeEmail, {
          siteName: SITE_NAME,
          oldEmail: data.old_email ?? '',
          email: data.email,
          newEmail: data.new_email ?? '',
          confirmationUrl: buildBrandedConfirmationUrl(data, 'email_change'),
        }),
    },
    reauthentication: {
      subject: 'Your verification code',
      render: (data) =>
        React.createElement(ReauthenticationEmail, { token: data.token ?? '' }),
    },
  },
})

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Handle CORS preflight for main endpoint
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Route to preview handler for /preview path
  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  return handler(req)
})
