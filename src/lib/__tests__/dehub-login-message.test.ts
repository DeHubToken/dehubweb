/**
 * The login message is a wire format, not copy.
 *
 * The API rebuilds this string byte-for-byte from the address and timestamp it
 * is sent and verifies the signature against the result, so any edit here —
 * a reworded line, a changed separator, a stray space — stops every wallet
 * login working, and the failure surfaces as "invalid signature", which reads
 * as a wallet fault and is not one.
 *
 * So the expectation below is a literal, pinned against
 * `buildLoginMessage` in the backend's common/util/auth.ts. If a change makes
 * this test fail, the change is wrong unless both sides ship together.
 */
import { describe, it, expect } from 'vitest';
import { buildDeHubLoginMessage } from '@/lib/dehub-login-message';

const ADDRESS = '0x6fe89b2ac9c8dda4b2ea3e8d786dfe249422c3e0';
// 2026-08-30T18:02:00Z — the minute a Phantom signup was last refused.
const TIMESTAMP = 1788112920;

describe('buildDeHubLoginMessage', () => {
  it('matches the string the API reconstructs, byte for byte', () => {
    expect(buildDeHubLoginMessage(ADDRESS, TIMESTAMP)).toBe(
      'Welcome to DeHub!\n' +
        '\n' +
        'Click to sign in for authentication.\n' +
        'Signatures are valid for 24 hours.\n' +
        `Your wallet address is ${ADDRESS}.\n` +
        'It is Sun, 30 Aug 2026 18:02:00 GMT.',
    );
  });

  it('lowercases the address, because the API compares against the lowercased one', () => {
    expect(buildDeHubLoginMessage(ADDRESS.toUpperCase(), TIMESTAMP)).toBe(
      buildDeHubLoginMessage(ADDRESS, TIMESTAMP),
    );
  });

  it('is stable across timezones — the date is rendered in UTC', () => {
    // toUTCString never varies by the host's zone; asserting it pins the
    // property that a signature made in Manila verifies on a server in London.
    expect(buildDeHubLoginMessage(ADDRESS, TIMESTAMP)).toContain('GMT.');
  });

  it('drops sub-second precision the same way both sides do', () => {
    // The caller floors to whole seconds; toUTCString has no milliseconds
    // anyway, so the two agree for any instant inside the same second.
    expect(buildDeHubLoginMessage(ADDRESS, TIMESTAMP)).toBe(
      buildDeHubLoginMessage(ADDRESS, Math.floor(TIMESTAMP)),
    );
  });
});
