/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface NotificationEmailProps {
  /** Short line at the top, e.g. "You received a tip". */
  heading: string
  /** The same sentence the in-app row carries, verbatim. */
  body: string
  /** Absolute dehub.io URL the row would open. */
  actionUrl: string
}

// One template for every notification type we mail. The backend already writes
// the sentence for the notification centre and the push, so the email says the
// same thing rather than inventing a third wording that then drifts — the copy
// arrives as `body` and this file only frames it.
export const NotificationEmail = ({ heading, body, actionUrl }: NotificationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{body}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{heading}</Heading>
        <Text style={text}>{body}</Text>
        <Button href={actionUrl} style={button}>
          Open on DeHub
        </Button>
        <Text style={footer}>
          You are getting this because email notifications are on for your DeHub
          account. Turn them off any time in Settings → Notifications.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default NotificationEmail

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
const button = {
  backgroundColor: '#000000',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
