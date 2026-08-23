import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/smart-wallet', () => ({
  lockWallet: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

import { lockWallet } from '@/lib/smart-wallet';
import {
  PROFILES_STORAGE_KEY,
  listProfiles,
  getProfile,
  currentProfileId,
  removeProfile,
  snapshotCurrentSession,
  beginProfileSwitch,
  cancelProfileSwitch,
} from '@/lib/profiles';

const SB_KEY = 'sb-testproject-auth-token';
const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function seedAccountA(): void {
  localStorage.setItem('dehub_token', 'tok-a');
  localStorage.setItem('dehub_refresh_token', 'rtok-a');
  localStorage.setItem('dehub_wallet', ADDR_A);
  localStorage.setItem('dehub_supabase_uid', 'uid-a');
  localStorage.setItem('dehub_connection_source', 'web3auth');
  localStorage.setItem('dehub_user', JSON.stringify({ displayName: 'Alice', username: 'alice' }));
  localStorage.setItem(SB_KEY, JSON.stringify({ access_token: 'sa-now', refresh_token: 'sr-now' }));
  localStorage.setItem('wagmi.connected', '1');
}

function seedAccountB(): void {
  // Session teardown only — the profiles registry must survive it, exactly as
  // a real switch never clears dehub_profiles_v1.
  for (const key of Object.keys(localStorage)) {
    if (key !== PROFILES_STORAGE_KEY) localStorage.removeItem(key);
  }
  localStorage.setItem('dehub_token', 'tok-b');
  localStorage.setItem('dehub_refresh_token', 'rtok-b');
  localStorage.setItem('dehub_wallet', ADDR_B);
  localStorage.setItem('wagmi.connector', 'metaMask');
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  // Un-stick the in-switch guard a staged switch leaves behind.
  cancelProfileSwitch();
});

describe('snapshotCurrentSession', () => {
  it('records the live account with its session keys', () => {
    seedAccountA();
    snapshotCurrentSession();

    const profiles = listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe('uid-a');
    expect(profiles[0].address.toLowerCase()).toBe(ADDR_A);
    expect(profiles[0].name).toBe('Alice');
    expect(profiles[0].username).toBe('alice');
    expect(profiles[0].session?.tokens['dehub_token']).toBe('tok-a');
    expect(profiles[0].session?.supabase).toEqual({
      access_token: 'sa-now',
      refresh_token: 'sr-now',
    });
  });

  it('keys wallet-only accounts by address when there is no Supabase uid', () => {
    seedAccountB();
    snapshotCurrentSession();

    expect(currentProfileId()).toBe(`addr:${ADDR_B}`);
    expect(getProfile(`addr:${ADDR_B}`)?.session?.tokens['dehub_token']).toBe('tok-b');
  });

  it('ignores a half-established flow with a wallet but no token', () => {
    localStorage.setItem('dehub_wallet', ADDR_A);
    localStorage.removeItem('dehub_token');
    snapshotCurrentSession();
    expect(listProfiles()).toHaveLength(0);
  });

  it('updates the existing entry rather than duplicating it', () => {
    seedAccountA();
    snapshotCurrentSession();
    localStorage.setItem('dehub_token', 'tok-a-rotated');
    snapshotCurrentSession();

    const profiles = listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].session?.tokens['dehub_token']).toBe('tok-a-rotated');
  });
});

describe('switching', () => {
  it('restores the target account and locks the outgoing wallet key away', () => {
    seedAccountA();
    snapshotCurrentSession();
    seedAccountB();
    snapshotCurrentSession();
    expect(listProfiles()).toHaveLength(2);

    const plan = beginProfileSwitch('uid-a');

    expect(plan).not.toBeNull();
    expect(plan!.id).toBe('uid-a');
    expect(plan!.uid).toBe('uid-a');
    expect(plan!.address.toLowerCase()).toBe(ADDR_A);
    expect(plan!.supabase).toEqual({ access_token: 'sa-now', refresh_token: 'sr-now' });

    // Target's session keys are on disk…
    expect(localStorage.getItem('dehub_token')).toBe('tok-a');
    expect(localStorage.getItem('dehub_supabase_uid')).toBe('uid-a');
    expect(localStorage.getItem('wagmi.connector')).toBeNull();
    expect(localStorage.getItem('wagmi.connected')).toBe('1');
    // …the outgoing account's wallet-specific keys are not…
    expect(localStorage.getItem('dehub_wallet')).toBe(ADDR_A);
    expect(localStorage.getItem('dehub_user')).toContain('Alice');
    // …and the vault was locked so the incoming profile starts sealed.
    expect(lockWallet).toHaveBeenCalledTimes(1);
  });

  it('returns null for an unknown or session-less profile without touching disk', () => {
    seedAccountB();
    snapshotCurrentSession();

    expect(beginProfileSwitch('uid-a')).toBeNull();
    expect(lockWallet).not.toHaveBeenCalled();
    expect(localStorage.getItem('dehub_token')).toBe('tok-b');
  });

  it('returns null when the stored profile has lost its session', () => {
    seedAccountA();
    snapshotCurrentSession();
    const store = JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY)!);
    store[0].session = null;
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(store));

    expect(beginProfileSwitch('uid-a')).toBeNull();
    expect(lockWallet).not.toHaveBeenCalled();
  });

  it('does not snapshot over a staged switch', () => {
    seedAccountA();
    snapshotCurrentSession();
    seedAccountB();
    snapshotCurrentSession();

    beginProfileSwitch('uid-a');
    // Keys on disk now belong to A mid-handoff; tracking must leave them alone.
    snapshotCurrentSession();

    const b = getProfile(`addr:${ADDR_B}`);
    expect(b?.session?.tokens['dehub_token']).toBe('tok-b');
  });
});

describe('removeProfile', () => {
  it('drops only the removed entry', () => {
    seedAccountA();
    snapshotCurrentSession();
    seedAccountB();
    snapshotCurrentSession();

    removeProfile('uid-a');

    const ids = listProfiles().map((p) => p.id);
    expect(ids).toEqual([`addr:${ADDR_B}`]);
  });
});
