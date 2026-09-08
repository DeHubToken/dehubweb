import { describe, expect, it } from 'vitest';
import {
  notificationPriorityBand,
  sortNotifications,
} from '@/lib/notification-priority';

const now = Date.parse('2026-09-08T12:00:00Z');
const item = (id: string, type: string, minutesAgo: number, read = false) => ({
  id,
  type,
  read,
  createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
});

describe('notification priority', () => {
  it('puts unread actionable work ahead of newer passive activity', () => {
    const sorted = sortNotifications([
      item('like', 'like', 1),
      item('request', 'follow_request', 40),
      item('tip', 'tip', 20),
    ], 'priority', now);
    expect(sorted.map((entry) => entry.id)).toEqual(['request', 'tip', 'like']);
  });

  it('moves handled rows below every unread row immediately', () => {
    const sorted = sortNotifications([
      item('handled', 'account_warning', 1, true),
      item('unread', 'like', 500),
    ], 'priority', now);
    expect(sorted.map((entry) => entry.id)).toEqual(['unread', 'handled']);
  });

  it('supports a newest-first user override', () => {
    const sorted = sortNotifications([
      item('older-action', 'follow_request', 20),
      item('new-like', 'like', 1),
    ], 'newest', now);
    expect(sorted.map((entry) => entry.id)).toEqual(['new-like', 'older-action']);
  });

  it('exposes concise semantic bands for the rows', () => {
    expect(notificationPriorityBand(item('a', 'follow_request', 1))).toBe('action');
    expect(notificationPriorityBand(item('b', 'tip', 1))).toBe('important');
    expect(notificationPriorityBand(item('c', 'like', 1))).toBe('new');
    expect(notificationPriorityBand(item('d', 'tip', 1, true))).toBe('earlier');
  });
});
