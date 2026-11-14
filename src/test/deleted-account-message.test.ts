import { describe, expect, it } from 'vitest';
import { deletedAccountMessage } from '@/lib/deleted-account';

const NOW = Date.parse('2026-11-14T10:00:00Z');

describe('deletedAccountMessage', () => {
  it('says how long until the same email can sign up again', () => {
    expect(deletedAccountMessage('2026-11-15T09:30:00Z', NOW)).toContain('24 hours');
    expect(deletedAccountMessage('2026-11-14T10:20:00Z', NOW)).toContain('1 hour');
  });

  it('counts long waits in days', () => {
    expect(deletedAccountMessage('2026-11-20T10:00:00Z', NOW)).toContain('6 days');
  });

  it('has no wait once the deletion has finished', () => {
    expect(deletedAccountMessage(undefined, NOW)).toContain('sign up again as a new account');
    expect(deletedAccountMessage('2026-11-14T09:00:00Z', NOW)).toContain('sign up again as a new account');
  });
});
