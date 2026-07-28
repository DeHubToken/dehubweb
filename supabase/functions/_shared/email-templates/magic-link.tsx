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

interface MagicLinkEmailProps {
  siteName: string
  siteUrl?: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteUrl = 'https://dehub.io',
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Exo:wght@400;600;700&display=swap"
      />
    </Head>
    <Preview>Your DeHub magic link — tap to log in</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandRow}>
          <Text style={brandMark}>DeHub</Text>
        </Section>

        <Heading style={h1}>Log in to DeHub</Heading>
        <Text style={text}>
          Tap the button below to log in. No password needed — this is a
          one-time magic link that expires shortly.
        </Text>

        <Section style={buttonWrap}>
          <Button style={button} href={confirmationUrl}>
            Log in to DeHub
          </Button>
        </Section>

        <Hr style={hr} />

        <Text style={footer}>
          If you didn't request this link, you can safely ignore this email —
          your account stays secure.
        </Text>
        <Text style={footerBrand}>
          DeHub — Open source. Censorship resistant. User owned.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '"Exo", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
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
  letterSpacing: '-0.01em',
  color: '#0a0a0a',
  margin: 0,
  textTransform: 'none' as const,
  fontFamily: '"Exo", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
}
const h1 = {
  fontSize: '26px',
  fontWeight: '700' as const,
  letterSpacing: '-0.01em',
  color: '#0a0a0a',
  margin: '0 0 16px',
  textTransform: 'none' as const,
  fontFamily: '"Exo", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
}
const text = {
  fontSize: '15px',
  color: '#2a2a2a',
  lineHeight: '1.55',
  margin: '0 0 24px',
  textTransform: 'none' as const,
  fontFamily: '"Exo", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
}
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
const hr = { borderColor: '#e6e2d8', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#7a7a7a', margin: '0 0 8px', lineHeight: '1.5' }
const footerBrand = { fontSize: '12px', color: '#7a7a7a', margin: 0 }
const footerLink = { color: '#0a0a0a', textDecoration: 'none', fontWeight: '600' as const }
