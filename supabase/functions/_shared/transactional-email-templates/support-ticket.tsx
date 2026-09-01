// Support ticket email — filed by the assistant, always delivered to the dev
// inbox. The recipient is fixed here so no caller can address it elsewhere.
import { SupportTicketEmail } from '../email-templates/support-ticket.tsx'
import type { TemplateEntry } from './registry.ts'

export const template = {
  component: SupportTicketEmail,
  subject: (data: Record<string, any>) =>
    `[${data.reference ?? 'ticket'}] ${data.severity === 'urgent' ? 'URGENT · ' : ''}${data.subject ?? 'Support ticket'}`,
  displayName: 'Support ticket',
  to: 'dev@dehub.io',
  previewData: {
    reference: 'DH-1234',
    subject: 'Cannot upload a video',
    description: 'The upload stalls at 90%.',
    category: 'bug',
    severity: 'normal',
    platform: 'web',
    stepsToReproduce: null,
    relatedUrl: null,
    diagnostics: null,
    reporter: {
      address: '0x1234…abcd',
      username: 'satoshi',
      displayName: 'Satoshi',
      email: 'user@example.com',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  },
} satisfies TemplateEntry
