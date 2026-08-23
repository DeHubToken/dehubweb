/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailLinkCodeEmailProps {
  code: string
}

// Sent when a wallet-login account attaches an email address it wants to sign
// in with later. The code is the only thing that matters here — no link, so
// nothing to click and nothing to misroute into spam filters.
export const EmailLinkCodeEmail = ({ code }: EmailLinkCodeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your DeHub sign-in code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Link your email to DeHub</Heading>
        <Text style={text}>
          Use the code below to finish linking this email address to your DeHub
          account. After that you can sign in with a code sent here.
        </Text>
        <Text style={codeStyle}>{code}</Text>
        <Text style={footer}>
          This code expires in 10 minutes. If you didn't request it, you can
          safely ignore this email — nothing changes on your account until the
          code is entered.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailLinkCodeEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
