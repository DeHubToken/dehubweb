// One activity notification, mailed to a reader who asked for them.
import { NotificationEmail } from '../email-templates/notification.tsx'
import type { TemplateEntry } from './registry.ts'

export const template = {
  component: NotificationEmail,
  // The backend picks the subject per notification type and passes it through,
  // so one template covers all of them without a switch in here.
  subject: (data: Record<string, any>) => data.subject || 'New activity on DeHub',
  displayName: 'Activity notification',
  previewData: {
    subject: 'You received a tip',
    heading: 'You received a tip',
    body: 'alice tipped you 5 DHB on your video "Morning ride"',
    actionUrl: 'https://dehub.io/app/post/1234',
  },
} satisfies TemplateEntry
