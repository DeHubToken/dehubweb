// Verification code mailed when a wallet-login account links an email address.
import { EmailLinkCodeEmail } from '../email-templates/email-link-code.tsx'
import type { TemplateEntry } from './registry.ts'

export const template = {
  component: EmailLinkCodeEmail,
  subject: 'Your DeHub sign-in code',
  displayName: 'Email sign-in code',
  previewData: { code: '123456' },
} satisfies TemplateEntry
