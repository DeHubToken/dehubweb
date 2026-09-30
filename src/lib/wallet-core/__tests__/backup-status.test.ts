import { describe, expect, it, vi } from 'vitest';
import { shouldRemindBackup, type BackupStatus } from '../backup-status';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-10T12:00:00Z');
const status = (over: Partial<BackupStatus> = {}): BackupStatus => ({
  backedUpAt: null,
  remindersDismissed: 0,
  lastDismissedAt: null,
  walletCreatedAt: new Date(now - 5 * DAY).toISOString(),
  walletAddress: '0xabc',
  ...over,
});

describe('backup reminders', () => {
  it('reminds a wallet that is a few days old and not backed up', () => {
    expect(shouldRemindBackup(status(), now)).toBe(true);
  });
  it('stays quiet in the first two days', () => {
    expect(shouldRemindBackup(status({ walletCreatedAt: new Date(now - DAY).toISOString() }), now)).toBe(false);
  });
  it('never reminds once backed up', () => {
    expect(shouldRemindBackup(status({ backedUpAt: new Date(now - DAY).toISOString() }), now)).toBe(false);
  });
  it('waits three days after a "Not now"', () => {
    expect(shouldRemindBackup(status({ remindersDismissed: 1, lastDismissedAt: new Date(now - DAY).toISOString() }), now)).toBe(false);
    expect(shouldRemindBackup(status({ remindersDismissed: 1, lastDismissedAt: new Date(now - 4 * DAY).toISOString() }), now)).toBe(true);
  });
  it('stops for good after three "Not now" taps', () => {
    expect(shouldRemindBackup(status({ remindersDismissed: 3, lastDismissedAt: new Date(now - 30 * DAY).toISOString() }), now)).toBe(false);
  });
  it('shows nothing when the status is unknown', () => {
    expect(shouldRemindBackup(null, now)).toBe(false);
  });
});
