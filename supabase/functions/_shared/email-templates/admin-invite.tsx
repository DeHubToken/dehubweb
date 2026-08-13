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

interface AdminInviteEmailProps {
  siteName: string
  role: string
  inviteLink: string
  expiresInDays: number
}

export const AdminInviteEmail = ({
  siteName,
  role,
  inviteLink,
  expiresInDays,
}: AdminInviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to the {siteName} admin panel</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Admin panel invitation</Heading>
        <Text style={text}>
          You've been invited to the <strong>{siteName}</strong> admin panel
          with the <strong>{role}</strong> role. Click the button below to set
          your password and activate your account.
        </Text>
        <Button style={button} href={inviteLink}>
          Set Up Your Account
        </Button>
        <Text style={footer}>
          This link expires in {expiresInDays} days. If you weren't expecting
          this invitation, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default AdminInviteEmail

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
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
