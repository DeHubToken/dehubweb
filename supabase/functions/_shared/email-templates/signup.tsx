/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your DeHub magic link — tap to finish signing up</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandRow}>
          <Text style={brandMark}>DeHub</Text>
        </Section>

        <Heading style={h1}>Welcome to DeHub</Heading>
        <Text style={text}>
          Tap the button below to finish creating your account for{' '}
          <Link href={`mailto:${recipient}`} style={link}>{recipient}</Link>.
          No password needed — this is a one-time magic link.
        </Text>

        <Section style={buttonWrap}>
          <Button style={button} href={confirmationUrl}>
            Sign up to DeHub
          </Button>
        </Section>

        <Text style={smallMuted}>
          Or paste this link into your browser:
          <br />
          <Link href={confirmationUrl} style={rawLink}>{confirmationUrl}</Link>
        </Text>

        <Hr style={hr} />

        <Text style={footer}>
          This link expires shortly and can only be used once. If you didn't
          request it, you can safely ignore this email.
        </Text>
        <Text style={footerBrand}>
          <Link href={siteUrl} style={footerLink}>DeHub</Link> — the decentralized social network.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  padding: '40px 0',
}
const container = {
  maxWidth: '520px',
  margin: '0 auto',
  padding: '32px 32px 24px',
  backgroundColor: '#f9f8f4',
  borderRadius: '16px',
}
const brandRow = { marginBottom: '28px' }
const brandMark = {
  fontSize: '18px',
  fontWeight: '700' as const,
  letterSpacing: '-0.02em',
  color: '#0a0a0a',
  margin: 0,
}
const h1 = {
  fontSize: '26px',
  fontWeight: '700' as const,
  letterSpacing: '-0.02em',
  color: '#0a0a0a',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: '#2a2a2a',
  lineHeight: '1.55',
  margin: '0 0 24px',
}
const link = { color: '#0a0a0a', textDecoration: 'underline' }
const buttonWrap = { margin: '8px 0 24px' }
const button = {
  backgroundColor: '#0a0a0a',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '14px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const smallMuted = {
  fontSize: '12px',
  color: '#6b6b6b',
  lineHeight: '1.5',
  margin: '0 0 8px',
  wordBreak: 'break-all' as const,
}
const rawLink = { color: '#6b6b6b', textDecoration: 'underline' }
const hr = { borderColor: '#e6e2d8', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#7a7a7a', margin: '0 0 8px', lineHeight: '1.5' }
const footerBrand = { fontSize: '12px', color: '#7a7a7a', margin: 0 }
const footerLink = { color: '#0a0a0a', textDecoration: 'none', fontWeight: '600' as const }
