// Admin panel invite email.
import { AdminInviteEmail } from '../email-templates/admin-invite.tsx'
import type { TemplateEntry } from './registry.ts'

export const template = {
  component: AdminInviteEmail,
  subject: "You've been invited to the Riftn admin panel",
  displayName: 'Admin invite',
  previewData: {
    siteName: 'Riftn',
    role: 'Admin',
    inviteLink: 'https://godmode.dehub.io/admin/onboarding?token=sample',
    expiresInDays: 7,
  },
} satisfies TemplateEntry
