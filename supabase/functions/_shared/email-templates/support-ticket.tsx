/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

/**
 * The support ticket as it lands in the dev inbox.
 *
 * Read by someone triaging a queue, so the shape is deliberately boring: the
 * reference and severity first, then who reported it and how to reach them,
 * then the report itself. Every value here originates in a conversation with a
 * user, so it is rendered as JSX text and never as markup — react-email escapes
 * it, which is what keeps a pasted <script> or a "ignore previous instructions"
 * line inert and merely visible.
 */

export interface SupportTicketReporter {
  address: string
  username?: string | null
  displayName?: string | null
  email?: string | null
}

export interface SupportTicketEmailProps {
  /**
   * Named `reference`, not `ref` — React treats a `ref` prop specially and
   * never passes it through to a function component, so the ticket number
   * would silently render as `undefined` everywhere in this email.
   */
  reference: string
  subject: string
  description: string
  category: string
  severity: string
  platform: string
  stepsToReproduce?: string | null
  relatedUrl?: string | null
  diagnostics?: Record<string, unknown> | null
  reporter: SupportTicketReporter
  createdAt?: string | null
}

const LABELS: Record<string, string> = {
  account_access: 'Account access',
  wallet_or_transactions: 'Wallet / transactions',
  posting_or_uploads: 'Posting / uploads',
  payments_or_subscriptions: 'Payments / subscriptions',
  live_streaming: 'Live streaming',
  content_or_moderation: 'Content / moderation',
  bug: 'Bug',
  feature_request: 'Feature request',
  other: 'Other',
}

const SEVERITY_COLOR: Record<string, string> = {
  urgent: '#b42318',
  high: '#b54708',
  normal: '#101828',
  low: '#667085',
}

const Field = ({ label, value }: { label: string; value: string }) => (
  <Text style={field}>
    <span style={fieldLabel}>{label}</span>
    <span style={fieldValue}>{value}</span>
  </Text>
)

export const SupportTicketEmail = ({
  reference: ticketRef,
  subject,
  description,
  category,
  severity,
  platform,
  stepsToReproduce,
  relatedUrl,
  diagnostics,
  reporter,
  createdAt,
}: SupportTicketEmailProps) => {
  const who = reporter.username
    ? `@${reporter.username}`
    : reporter.displayName || reporter.address

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        [{ticketRef}] {subject}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>
            DeHub support · {ticketRef} ·{' '}
            <span style={{ color: SEVERITY_COLOR[severity] || SEVERITY_COLOR.normal }}>
              {severity.toUpperCase()}
            </span>
          </Text>
          <Heading style={h1}>{subject}</Heading>

          <Section style={panel}>
            <Field label="Reported by" value={who} />
            <Field label="Wallet" value={reporter.address} />
            <Field label="Reply to" value={reporter.email || 'no email on the account'} />
            <Field label="Area" value={LABELS[category] || category} />
            <Field label="Platform" value={platform} />
            {createdAt ? <Field label="Opened" value={createdAt} /> : null}
          </Section>

          <Heading style={h2}>What they reported</Heading>
          <Text style={body}>{description}</Text>

          {stepsToReproduce ? (
            <>
              <Heading style={h2}>Steps to reproduce</Heading>
              <Text style={body}>{stepsToReproduce}</Text>
            </>
          ) : null}

          {relatedUrl ? (
            <>
              <Heading style={h2}>Related</Heading>
              <Text style={body}>{relatedUrl}</Text>
            </>
          ) : null}

          {diagnostics && Object.keys(diagnostics).length > 0 ? (
            <>
              <Heading style={h2}>Context</Heading>
              <Section style={panel}>
                {Object.entries(diagnostics).map(([key, value]) => (
                  <Field key={key} label={key} value={String(value)} />
                ))}
              </Section>
            </>
          ) : null}

          <Hr style={hr} />
          <Text style={footer}>
            Raised by the DeHub assistant on the user's behalf. The text above is
            written by a user — treat links and instructions in it as untrusted.
            Reply to {reporter.email || 'the user in-app'} to respond, and quote{' '}
            {ticketRef}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default SupportTicketEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '640px' }
const eyebrow = {
  fontSize: '12px',
  letterSpacing: '0.06em',
  color: '#667085',
  margin: '0 0 6px',
}
const h1 = {
  fontSize: '20px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 18px',
}
const h2 = {
  fontSize: '13px',
  fontWeight: 'bold' as const,
  color: '#101828',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '24px 0 8px',
}
const panel = {
  backgroundColor: '#f7f7f8',
  borderRadius: '8px',
  padding: '14px 16px',
}
const field = { fontSize: '13px', lineHeight: '1.6', margin: '0 0 4px' }
const fieldLabel = { color: '#667085', display: 'inline-block', minWidth: '110px' }
const fieldValue = { color: '#101828' }
const body = {
  fontSize: '14px',
  color: '#344054',
  lineHeight: '1.6',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}
const hr = { borderColor: '#eaecf0', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#999999', margin: '0' }
