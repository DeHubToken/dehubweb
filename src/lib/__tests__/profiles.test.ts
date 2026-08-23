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
  adoptCurrentProfile,
  applyProfileSnapshot,
  stageIncomingIdentity,
  listProfiles,
  getProfile,
  currentProfileId,
  removeProfile,
  snapshotCurrentSession,
  beginProfileSwitch,
  abortProfileSwitch,
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
  // Un-stage any switch the test left behind (no-op when none was staged).
  abortProfileSwitch(null);
});

describe('snapshotCurrentSession', () => {
  it('records an explicitly adopted account with its session keys', () => {
    seedAccountA();
    adoptCurrentProfile();

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

  it('never adds an uninvited account — tracking refreshes, adoption creates', () => {
    // Someone signs in once on a shared browser without ever using Add
    // profile. Background tracking sees them constantly; the list must not.
    seedAccountA();
    snapshotCurrentSession();
    expect(listProfiles()).toHaveLength(0);

    localStorage.setItem('dehub_token', 'tok-a-rotated');
    snapshotCurrentSession();
    expect(listProfiles()).toHaveLength(0);

    // The moment the user says "save this one", it lands — and later tracking
    // keeps its session fresh.
    adoptCurrentProfile();
    localStorage.setItem('dehub_token', 'tok-a-rotated-again');
    snapshotCurrentSession();
    const profiles = listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].session?.tokens['dehub_token']).toBe('tok-a-rotated-again');
  });

  it('keys wallet-only accounts by address when there is no Supabase uid', () => {
    seedAccountB();
    adoptCurrentProfile();

    expect(currentProfileId()).toBe(`addr:${ADDR_B}`);
    expect(getProfile(`addr:${ADDR_B}`)?.session?.tokens['dehub_token']).toBe('tok-b');
  });

  it('ignores a half-established flow with a wallet but no token', () => {
    localStorage.setItem('dehub_wallet', ADDR_A);
    localStorage.removeItem('dehub_token');
    adoptCurrentProfile();
    expect(listProfiles()).toHaveLength(0);
  });

  it('updates the existing entry rather than duplicating it', () => {
    seedAccountA();
    adoptCurrentProfile();
    localStorage.setItem('dehub_token', 'tok-a-rotated');
    adoptCurrentProfile();

    const profiles = listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].session?.tokens['dehub_token']).toBe('tok-a-rotated');
  });
});

describe('switching', () => {
  it('restores the target account and locks the outgoing wallet key away', () => {
    seedAccountA();
    adoptCurrentProfile();
    seedAccountB();
    adoptCurrentProfile();
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
    adoptCurrentProfile();

    expect(beginProfileSwitch('uid-a')).toBeNull();
    expect(lockWallet).not.toHaveBeenCalled();
    expect(localStorage.getItem('dehub_token')).toBe('tok-b');
  });

  it('returns null when the stored profile has lost its session', () => {
    seedAccountA();
    adoptCurrentProfile();
    const store = JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY)!);
    store[0].session = null;
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(store));

    expect(beginProfileSwitch('uid-a')).toBeNull();
    expect(lockWallet).not.toHaveBeenCalled();
  });

  it('does not snapshot over a staged switch', () => {
    seedAccountA();
    adoptCurrentProfile();
    seedAccountB();
    adoptCurrentProfile();

    beginProfileSwitch('uid-a');
    // Keys on disk now belong to A mid-handoff; tracking must leave them alone.
    snapshotCurrentSession();

    const b = getProfile(`addr:${ADDR_B}`);
    expect(b?.session?.tokens['dehub_token']).toBe('tok-b');
  });

  it('rolls back to the outgoing account when a staged switch aborts', () => {
    seedAccountA();
    adoptCurrentProfile();
    seedAccountB();
    adoptCurrentProfile();

    // Capture who is live BEFORE staging, exactly as switchToProfile does.
    const prevId = currentProfileId();
    beginProfileSwitch('uid-a');
    expect(localStorage.getItem('dehub_token')).toBe('tok-a');

    // setSession threw: disk goes back to whoever was live before the swap.
    abortProfileSwitch(prevId);

    expect(localStorage.getItem('dehub_token')).toBe('tok-b');
    expect(localStorage.getItem('dehub_refresh_token')).toBe('rtok-b');
    expect(localStorage.getItem('dehub_wallet')?.toLowerCase()).toBe(ADDR_B);
    expect(localStorage.getItem('wagmi.connector')).toBe('metaMask');
    expect(localStorage.getItem('wagmi.connected')).toBeNull();
    // And tracking resumes — the guard is cleared.
    snapshotCurrentSession();
    expect(getProfile(`addr:${ADDR_B}`)?.session?.tokens['dehub_token']).toBe('tok-b');
  });

  it('wipes staged keys instead of restoring when there was no live account', () => {
    seedAccountA();
    adoptCurrentProfile();
    seedAccountB();
    adoptCurrentProfile();

    // Switching from a signed-out state: nothing to roll back to.
    beginProfileSwitch('uid-a');
    abortProfileSwitch(null);

    expect(localStorage.getItem('dehub_token')).toBeNull();
    expect(localStorage.getItem('dehub_wallet')).toBeNull();
    expect(localStorage.getItem('wagmi.connected')).toBeNull();
    expect(localStorage.getItem('wagmi.connector')).toBeNull();
  });

  it('ignores an abort when no switch was staged', () => {
    seedAccountB();
    adoptCurrentProfile();
    localStorage.setItem('dehub_token', 'tok-live');

    abortProfileSwitch('uid-a');

    expect(localStorage.getItem('dehub_token')).toBe('tok-live');
  });
});

describe('removeProfile', () => {
  it('drops only the removed entry', () => {
    seedAccountA();
    adoptCurrentProfile();
    seedAccountB();
    adoptCurrentProfile();

    removeProfile('uid-a');

    const ids = listProfiles().map((p) => p.id);
    expect(ids).toEqual([`addr:${ADDR_B}`]);
  });
});

describe('stageIncomingIdentity', () => {
  it('clears the outgoing session but keeps the in-flight wagmi connection when asked', () => {
    seedAccountA();
    adoptCurrentProfile();

    stageIncomingIdentity({ keepWagmiKeys: true });

    // The outgoing account's keys are gone — the exchange writes fresh ones…
    expect(localStorage.getItem('dehub_token')).toBeNull();
    expect(localStorage.getItem('dehub_wallet')).toBeNull();
    expect(localStorage.getItem('dehub_supabase_uid')).toBeNull();
    expect(localStorage.getItem(SB_KEY)).toBeNull();
    // …its wallet key is locked away…
    expect(lockWallet).toHaveBeenCalled();
    // …but the wagmi storage the just-connected MetaMask wrote survives.
    expect(localStorage.getItem('wagmi.connected')).toBe('1');
    // And the pending-login flags cannot outlive their flow.
    localStorage.setItem('dehub_supa_login_pending', '1');
    localStorage.setItem('dehub_supa_login_pending_at', String(Date.now()));
    stageIncomingIdentity({ keepWagmiKeys: true });
    expect(localStorage.getItem('dehub_supa_login_pending')).toBeNull();
    expect(localStorage.getItem('dehub_supa_login_pending_at')).toBeNull();
  });

  it('wipes wagmi storage too when the incoming identity has none of its own', () => {
    seedAccountA();
    adoptCurrentProfile();

    stageIncomingIdentity();

    expect(localStorage.getItem('wagmi.connected')).toBeNull();
    expect(localStorage.getItem('wagmi.connector')).toBeNull();
    expect(localStorage.getItem('dehub_token')).toBeNull();
  });

  it('snapshots the outgoing account so an abandoned attempt can restore it', () => {
    seedAccountA();
    adoptCurrentProfile();

    stageIncomingIdentity({ keepWagmiKeys: true });

    const restored = applyProfileSnapshot('uid-a');
    expect(restored?.supabase).toEqual({ access_token: 'sa-now', refresh_token: 'sr-now' });
    expect(localStorage.getItem('dehub_token')).toBe('tok-a');
    expect(localStorage.getItem('wagmi.connected')).toBe('1');
  });

  it('leaves disk clean when restoring a profile that never existed', () => {
    seedAccountA();

    const restored = applyProfileSnapshot('uid-ghost');

    expect(restored?.supabase).toBeNull();
    expect(localStorage.getItem('dehub_token')).toBeNull();
  });
});
