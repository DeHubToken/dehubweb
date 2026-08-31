import { describe, it, expect, beforeEach } from 'vitest';
import {
  markIngestUnreachable,
  clearIngestUnreachable,
  hadRecentIngestFailure,
} from '@/lib/live-ingest';

// The mint-time reachability probe is one small GET, and the DPI-throttled
// networks it exists for pass one intermittently while never carrying the
// WHIP POST — a device there passes the probe, mints self-hosted, and dies
// seconds later, identically on every retry. The failure marker is what lets
// the next mint on that device outvote its own probe and go to Livepeer, so
// its lifecycle (set on a network-shaped direct failure, cleared by a real
// direct connect, expired on its own) is worth pinning down.
describe('ingest failure memory', () => {
  const KEY = 'dehub.ingest.unreachable-at';

  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with nothing to report', () => {
    expect(hadRecentIngestFailure()).toBe(false);
  });

  it('remembers a marked failure', () => {
    markIngestUnreachable();
    expect(hadRecentIngestFailure()).toBe(true);
  });

  it('forgets once a successful direct connect clears it', () => {
    markIngestUnreachable();
    clearIngestUnreachable();
    expect(hadRecentIngestFailure()).toBe(false);
  });

  it('expires on its own, so one bad café network cannot exile a device forever', () => {
    localStorage.setItem(KEY, String(Date.now() - 25 * 3600 * 1000));
    expect(hadRecentIngestFailure()).toBe(false);
  });

  it('treats garbage in the slot as no marker', () => {
    localStorage.setItem(KEY, 'not-a-timestamp');
    expect(hadRecentIngestFailure()).toBe(false);
  });
});
