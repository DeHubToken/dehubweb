import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Multi-account lifecycle against faithful backend semantics:
 *  - access token TTL 15 min (expiry via dehub_token_expires_at)
 *  - refresh tokens are SINGLE-USE; each refresh rotates RT_n -> RT_{n+1}
 *  - reusing an already-rotated RT revokes the whole family server-side
 */

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

import {
  adoptCurrentProfile,
  stageIncomingIdentity,
  listProfiles,
  currentProfileId,
  beginProfileSwitch,
  abortProfileSwitch,
  initProfileTracking,
} from '@/lib/profiles';
import { setAuthToken, refreshTokenSharedDetailed } from '@/lib/api/dehub/core';

const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

type Acct = 'A' | 'B';

const server = {
  families: new Map<Acct, { latestRT: string; used: Set<string> }>(),
  log: [] as string[],
  issue(acct: Acct): { token: string; refreshToken: string } {
    const n = Math.random().toString(36).slice(2, 8);
    const family = { latestRT: `rt-${acct}-${n}`, used: new Set<string>() };
    this.families.set(acct, family);
    this.log.push(`login(${acct})`);
    return { token: `tok-${acct}-${n}`, refreshToken: family.latestRT };
  },
  /** True when this exact RT may be redeemed right now; rotates on success. */
  redeem(rawRT: string): boolean {
    for (const [acct, fam] of this.families) {
      if (!fam.used.has(rawRT) && fam.latestRT === rawRT) {
        fam.used.add(rawRT);
        const n = Math.random().toString(36).slice(2, 8);
        fam.latestRT = `rt-${acct}-${n}`;
        this.log.push(`refresh(${acct}) ok`);
        return true;
      }
    }
    for (const [acct, fam] of this.families) {
      if (fam.used.has(rawRT)) {
        fam.latestRT = '';
        this.log.push(`refresh(${acct}) REUSE -> FAMILY REVOKED`);
        return false;
      }
    }
    return false;
  },
};

interface HeldRequest {
  body: { refreshToken: string };
  /** When set, the response is this verbatim result instead of server math. */
  forced: { ok: boolean; status: number; body?: Record<string, unknown> } | null;
  release: () => void;
}

/** When non-null, /api/auth/refresh requests park here until released. */
let gate: (() => void) | null;
let heldRequests: HeldRequest[];

type JsonBody = Record<string, unknown>;

function jsonResponse(ok: boolean, status: number, payload: JsonBody): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function installFetch(): void {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = String(url);
    if (target.includes('/api/auth/refresh')) {
      const body = JSON.parse(String(init.body)) as { refreshToken: string };
      type Forced = NonNullable<HeldRequest['forced']>;
      let forced: Forced | null = null;
      if (gate) {
        await new Promise<void>((resolve) => {
          heldRequests.push({
            body,
            forced: null,
            release: () => resolve(),
          });
        });
        forced = heldRequests.find((h) => h.body.refreshToken === body.refreshToken)?.forced ?? null;
      }
      if (forced) {
        // Keep server-side family state consistent with a forced success so
        // later redemptions of the rotated token behave realistically.
        if (forced.ok && typeof forced.body?.refreshToken === 'string') {
          const acct0: Acct = body.refreshToken.startsWith('rt-A') ? 'A' : 'B';
          const fam0 = server.families.get(acct0);
          if (fam0) {
            fam0.used.add(body.refreshToken);
            fam0.latestRT = String(forced.body.refreshToken);
          }
        }
        return jsonResponse(
          forced.ok,
          forced.status,
          forced.ok
            ? { status: true, ...(forced.body as JsonBody) }
            : { status: false, message: 'rejected' },
        );
      }
      // Re-read the family state at release time.
      const ok = server.redeem(body.refreshToken);
      const acct: Acct = body.refreshToken.startsWith('rt-A') ? 'A' : 'B';
      const fam = server.families.get(acct)!;
      return jsonResponse(
        ok,
        ok ? 200 : 401,
        ok
          ? { status: true, accessToken: `tok-${acct}-next`, refreshToken: fam.latestRT, expiresIn: 900 }
          : { status: false, message: 'Refresh token reuse detected' },
      );
    }
    return jsonResponse(true, 200, {});
  }));
}

let nowMs = 1_700_000_000_000;

function loginWrites(acct: Acct): void {
  const { token, refreshToken } = server.issue(acct);
  localStorage.setItem('dehub_wallet', acct === 'A' ? ADDR_A : ADDR_B);
  localStorage.setItem('dehub_user', JSON.stringify({ username: acct.toLowerCase(), displayName: acct }));
  setAuthToken(token);
  localStorage.setItem('dehub_refresh_token', refreshToken);
  localStorage.setItem('dehub_token_expires_at', String(nowMs + 15 * 60 * 1000));
}

async function releaseHeld(forced?: { ok: boolean; status: number; body?: Record<string, unknown> }): Promise<void> {
  await vi.waitUntil(() => heldRequests.length > 0, { timeout: 3000 });
  if (forced) heldRequests[0].forced = forced;
  heldRequests[0].release();
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  gate = null;
  heldRequests = [];
  server.families.clear();
  server.log = [];
  installFetch();
  initProfileTracking();
});

afterEach(() => {
  abortProfileSwitch(null);
  gate = null;
  vi.unstubAllGlobals();
});

describe('multi-account lifecycle vs rotating refresh tokens', () => {
  it('add B while A live, use both, switch back and forth — no dead RT ever submitted', async () => {
    loginWrites('A');
    adoptCurrentProfile();
    expect(currentProfileId()).toBe(`addr:${ADDR_A}`);

    // Add-profile sheet opens (adopts A); wagmi login stages the swap; B lands.
    adoptCurrentProfile();
    stageIncomingIdentity({ keepWagmiKeys: true });
    expect(localStorage.getItem('dehub_token')).toBeNull();
    loginWrites('B');
    adoptCurrentProfile();
    expect(listProfiles()).toHaveLength(2);
    expect(currentProfileId()).toBe(`addr:${ADDR_B}`);

    // B stays live through two background rotations (>15 min of use).
    nowMs += 14 * 60 * 1000;
    expect((await refreshTokenSharedDetailed()).ok).toBe(true);
    nowMs += 14 * 60 * 1000;
    expect((await refreshTokenSharedDetailed()).ok).toBe(true);

    // Switch back to A. Its access token is long expired by now; boot must
    // refresh with the RT frozen in the registry — still the live one.
    const plan = beginProfileSwitch(`addr:${ADDR_A}`);
    expect(plan).not.toBeNull();
    nowMs += 20 * 60 * 1000;
    const refreshed = await refreshTokenSharedDetailed();
    expect(refreshed.ok).toBe(true);

    // And back to B the same way.
    nowMs += 20 * 60 * 1000;
    const plan2 = beginProfileSwitch(`addr:${ADDR_B}`);
    expect(plan2).not.toBeNull();
    const refreshed2 = await refreshTokenSharedDetailed();
    expect(refreshed2.ok).toBe(true);
    expect(server.log.some((l) => l.includes('REUSE'))).toBe(false);
  });

  it('a rotation landing AFTER stageIncomingIdentity files to the old stash, never over the new owner', async () => {
    loginWrites('A');
    adoptCurrentProfile();

    // A's background refresh is mid-flight when the wagmi signature completes:
    // staging wipes A's keys and B's identity takes over disk.
    gate = () => {};
    const inflight = refreshTokenSharedDetailed();
    stageIncomingIdentity({ keepWagmiKeys: true });
    loginWrites('B');
    adoptCurrentProfile();
    const bTokenBefore = localStorage.getItem('dehub_token');

    const held = await releaseHeld({ ok: true, status: 200, body: { accessToken: 'tok-A-LATE', refreshToken: 'rt-A-LATE', expiresIn: 900 } });
    gate = null;
    void held;
    const outcome = await inflight;

    expect(outcome.ok).toBe(true);
    // Live keys still belong entirely to B…
    expect(localStorage.getItem('dehub_token')).toBe(bTokenBefore);
    expect(localStorage.getItem('dehub_wallet')).toBe(ADDR_B);
    // …and A's stored profile received the fresh chain instead of a dead one.
    const a = listProfiles().find((p) => p.id === `addr:${ADDR_A}`)!;
    expect(a.session!.tokens['dehub_refresh_token']).toBe('rt-A-LATE');

    // Switching back to A submits the filed, never-used RT successfully.
    const plan = beginProfileSwitch(`addr:${ADDR_A}`);
    expect(plan).not.toBeNull();
    expect((await refreshTokenSharedDetailed()).ok).toBe(true);
    expect(server.log.some((l) => l.includes('REVOKED'))).toBe(false);
  });

  it('a revoke landing after the keys changed hands must not clear the new owner', async () => {
    loginWrites('A');
    adoptCurrentProfile();

    gate = () => {};
    const inflight = refreshTokenSharedDetailed();
    stageIncomingIdentity({ keepWagmiKeys: true });
    loginWrites('B');
    adoptCurrentProfile();
    const bTokenBefore = localStorage.getItem('dehub_token');
    const bRtBefore = localStorage.getItem('dehub_refresh_token');

    await releaseHeld({ ok: false, status: 401 });
    gate = null;
    const outcome = await inflight;

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('revoked');
    // B's freshly written session survives the stale revoke.
    expect(localStorage.getItem('dehub_token')).toBe(bTokenBefore);
    expect(localStorage.getItem('dehub_refresh_token')).toBe(bRtBefore);
  });
});


