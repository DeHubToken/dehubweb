export const NOTIFICATION_FILTER_LABELS = {
  all: { key: 'notifications.title', defaultLabel: 'Notifications' },
  likes: { key: 'notifications.likes', defaultLabel: 'Reactions' },
  follows: { key: 'notifications.follows', defaultLabel: 'Follows' },
  comments: { key: 'notifications.comments', defaultLabel: 'Comments' },
  reposts: { key: 'notifications.reposts', defaultLabel: 'Reposts' },
  features: { key: 'notifications.features', defaultLabel: 'Features' },
  communities: { key: 'notifications.communities', defaultLabel: 'Communities' },
  stores: { key: 'notifications.stores', defaultLabel: 'Stores' },
  subscriptions: { key: 'notifications.subscriptions', defaultLabel: 'Subscriptions' },
  tips: { key: 'notifications.tips', defaultLabel: 'Tips' },
  livestreams: { key: 'notifications.livestreams', defaultLabel: 'Livestreams' },
} as const;

export type NotificationTypeFilter = keyof typeof NOTIFICATION_FILTER_LABELS;

type LabelTranslator = (key: string, defaultLabel: string) => string;

export function getNotificationFilterLabel(
  filter: NotificationTypeFilter,
  translate: LabelTranslator,
): string {
  const { key, defaultLabel } = NOTIFICATION_FILTER_LABELS[filter];
  const translated = translate(key, defaultLabel);

  return translated && translated !== key ? translated : defaultLabel;
}
