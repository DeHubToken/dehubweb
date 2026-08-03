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
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName?: string
  siteUrl?: string
  confirmationUrl: string
  token?: string
}

export const MagicLinkEmail = ({
  confirmationUrl,
  token,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Exo:wght@400;600;700&display=swap"
      />
    </Head>
    <Preview>Your DeHub login code{token ? ` — ${token}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Text style={brandMark}>DeHub</Text>

          <Heading style={h1}>Log in to DeHub</Heading>
          <Text style={lede}>
            Enter this one-time code in the app to finish logging in.
          </Text>

          {token ? (
            <Section style={codeWrap}>
              <Text style={codeValue}>{token}</Text>
              <Text style={codeHint}>Tap and hold to copy · expires shortly</Text>
            </Section>
          ) : null}

          <Section style={dividerWrap}>
            <Hr style={dividerLine} />
            <Text style={dividerLabel}>or</Text>
          </Section>

          <Section style={buttonWrap}>
            <Button style={button} href={confirmationUrl}>
              Log in with one tap
            </Button>
          </Section>

          <Text style={fine}>
            This link works once and only on this device's browser.
          </Text>
        </Section>

        <Text style={footer}>
          Didn't request this? You can safely ignore this email — your account
          stays secure.
        </Text>
        <Text style={footerBrand}>
          DeHub — Open source. Censorship resistant. User owned.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const FONT =
  '"Exo", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const MONO = '"SFMono-Regular", Menlo, Consolas, "Courier New", monospace'

const main = {
  backgroundColor: '#ffffff',
  fontFamily: FONT,
  padding: '48px 16px',
}
const container = { maxWidth: '520px', margin: '0 auto' }
const card = {
  padding: '40px 40px 36px',
  backgroundColor: '#f9f8f4',
  borderRadius: '20px',
  border: '1px solid #ece8df',
}
const brandMark = {
  fontSize: '15px',
  fontWeight: '700' as const,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: '#0a0a0a',
  margin: '0 0 32px',
  fontFamily: FONT,
}
const h1 = {
  fontSize: '26px',
  lineHeight: '1.2',
  fontWeight: '700' as const,
  letterSpacing: '-0.015em',
  color: '#0a0a0a',
  margin: '0 0 10px',
  fontFamily: FONT,
}
const lede = {
  fontSize: '15px',
  color: '#5d5b55',
  lineHeight: '1.6',
  margin: '0 0 28px',
  fontFamily: FONT,
}
const codeWrap = {
  margin: '0 0 8px',
  padding: '22px 16px 16px',
  backgroundColor: '#ffffff',
  border: '1px solid #e6e2d8',
  borderRadius: '14px',
  textAlign: 'center' as const,
}
const codeValue = {
  fontSize: '34px',
  lineHeight: '1.1',
  fontWeight: '700' as const,
  letterSpacing: '0.22em',
  textIndent: '0.22em',
  color: '#0a0a0a',
  margin: '0 0 10px',
  fontFamily: MONO,
}
const codeHint = {
  fontSize: '11px',
  letterSpacing: '0.04em',
  color: '#9a978f',
  margin: 0,
  fontFamily: FONT,
}
const dividerWrap = { margin: '24px 0 20px', textAlign: 'center' as const }
const dividerLine = { borderColor: '#e6e2d8', margin: '0 0 -10px' }
const dividerLabel = {
  display: 'inline-block',
  backgroundColor: '#f9f8f4',
  padding: '0 12px',
  fontSize: '12px',
  color: '#9a978f',
  margin: 0,
  fontFamily: FONT,
}
const buttonWrap = { margin: '0 0 20px', textAlign: 'center' as const }
const button = {
  backgroundColor: '#0a0a0a',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '15px 28px',
  textDecoration: 'none',
  display: 'block',
  textAlign: 'center' as const,
  fontFamily: FONT,
}
const fine = {
  fontSize: '12px',
  color: '#9a978f',
  lineHeight: '1.5',
  margin: 0,
  textAlign: 'center' as const,
  fontFamily: FONT,
}
const footer = {
  fontSize: '12px',
  color: '#9a978f',
  margin: '24px 4px 6px',
  lineHeight: '1.6',
  fontFamily: FONT,
}
const footerBrand = {
  fontSize: '12px',
  color: '#9a978f',
  margin: '0 4px',
  fontFamily: FONT,
}
