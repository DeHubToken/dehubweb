import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import { humanizeTranslationKey } from '@/i18n/missing-key-fallback';
import {
  getNotificationFilterLabel,
  NOTIFICATION_FILTER_LABELS,
} from '@/lib/notification-filter-labels';

describe('notification translations', () => {
  it('defines every notification filter in the English fallback locale', () => {
    for (const { key } of Object.values(NOTIFICATION_FILTER_LABELS)) {
      const leaf = key.replace('notifications.', '');
      expect(en.notifications).toHaveProperty(leaf);
    }
  });

  it('defines every literal notification key used by the notifications page', () => {
    const page = readFileSync(resolve('src/pages/app/NotificationsPage.tsx'), 'utf8');
    const keys = [...page.matchAll(/['"]notifications\.([A-Za-z0-9]+)['"]/g)]
      .map((match) => match[1]);

    for (const key of new Set(keys)) {
      expect(en.notifications, `Missing notifications.${key}`).toHaveProperty(key);
    }
  });

  it('never exposes a raw filter key when a translation is unavailable', () => {
    for (const filter of Object.keys(NOTIFICATION_FILTER_LABELS)) {
      const label = getNotificationFilterLabel(
        filter as keyof typeof NOTIFICATION_FILTER_LABELS,
        (key) => key,
      );

      expect(label).not.toContain('notifications.');
      expect(label).not.toContain('.');
    }
  });
});

describe('global missing translation fallback', () => {
  it('turns internal keys into readable labels', () => {
    expect(humanizeTranslationKey('notifications.storeOrders')).toBe('Store Orders');
    expect(humanizeTranslationKey('features.new_feature')).toBe('New feature');
    expect(humanizeTranslationKey('common.live-streams')).toBe('Live streams');
  });
});
