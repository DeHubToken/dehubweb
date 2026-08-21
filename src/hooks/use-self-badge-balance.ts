/**
 * Live badge balance for the signed-in wallet
 * ===========================================
 * `badgeBalance` is a denormalised number on the API's account row — DHB held
 * plus DHB staked, summed across BSC and Base — and it only moves when the
 * backend's chain webhook gets around to refreshing it. Everything downstream
 * inherits that lag: the auth user is written once at sign-in and cached in
 * localStorage, feed payloads carry whatever the row said when the page was
 * built, and the badge lookup query used to hold its answer for half an hour.
 * Someone who has just bought their way past 10,000 DHB can sit there with no
 * badge for a long time, with nothing on screen to tell them why.
 *
 * The wallet half of that sum is readable straight from the chain in two
 * `balanceOf` calls, so read it and stop waiting. The staked half still comes
 * from the API (`balanceData`), because only the backend knows it.
 *
 * **This can only ever promote.** Callers take `Math.max` of this and whatever
 * the payload said, so a flaky RPC, an unread endpoint, or the gap between
 * "wallet emptied into the staking address" and "backend counted the stake"
 * can never strip a badge someone already has. Demotion stays on the API's
 * schedule, exactly as it is today.
 *
 * One owner does the fetching — `<SelfBadgeSync/>`, mounted once in the app
 * shell. Everywhere else reads the cached answer through `useSelfBadge`, whose
 * observer never fetches, so a feed of a hundred cards costs no extra
 * requests.
 */

import { useContext, useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { AuthContext } from '@/contexts/AuthContext';
import { CHAIN_CONFIGS, BASE_CHAIN_ID, BNB_CHAIN_ID, initChainRpcUrls } from '@/lib/contracts/dhb-token';
import type { DeHubUser } from '@/lib/api/dehub';

/** The chains whose DHB the API counts toward a badge. Must match the backend. */
const BADGE_CHAIN_IDS = [BNB_CHAIN_ID, BASE_CHAIN_ID];

export const SELF_BADGE_QUERY_KEY = 'self-badge-balance';

/** keccak('balanceOf(address)')[0..4] */
const BALANCE_OF_SELECTOR = '0x70a08231';

/**
 * A single `balanceOf` over plain JSON-RPC. Deliberately not ethers/aa-utils:
 * this module is reachable from the entry bundle through BadgeIcon, and the
 * wallet stack must not be (scripts/check-entry-bundle.mjs).
 */
async function balanceOf(rpcUrl: string, token: string, address: string): Promise<bigint> {
  const data = BALANCE_OF_SELECTOR + address.replace('0x', '').toLowerCase().padStart(64, '0');
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: token, data }, 'latest'],
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = await res.json();
  if (json.error || !json.result || json.result === '0x') {
    throw new Error(json.error?.message || 'empty eth_call result');
  }
  return BigInt(json.result);
}

/** DHB sitting in the wallet across both badge chains. */
async function readWalletDhb(address: string): Promise<number> {
  // Picks up the Alchemy endpoints when they are configured; the public RPCs
  // in CHAIN_CONFIGS are the fallback. Cached per session, so this is free
  // after the first call.
  await initChainRpcUrls();

  const raw = await Promise.all(
    BADGE_CHAIN_IDS.map(chainId => {
      const config = CHAIN_CONFIGS[chainId];
      return balanceOf(config.rpcUrl, config.dhbToken, address);
    }),
  );

  const total = raw.reduce((sum, value) => sum + value, BigInt(0));
  // Badge tiers are coarse and the API stores a float too — precision past
  // the decimal point buys nothing here.
  return Number(total) / 1e18;
}

/** The staked half of the badge sum. Only the API knows this one. */
function stakedFromUser(user: DeHubUser | null | undefined): number {
  const rows = user?.balanceData;
  if (!Array.isArray(rows)) return 0;

  const badgeTokens = new Set(
    BADGE_CHAIN_IDS.map(id => CHAIN_CONFIGS[id]?.dhbToken?.toLowerCase()).filter(Boolean),
  );

  return rows.reduce(
    (sum, row) =>
      badgeTokens.has(String(row?.tokenAddress || '').toLowerCase()) ? sum + (row?.staked || 0) : sum,
    0,
  );
}

/** Normalise a username or address into something comparable. */
function normaliseId(value?: string | null): string {
  return value?.replace('@', '').trim().toLowerCase() || '';
}

export interface SelfBadge {
  /** Lowercased wallet address of the signed-in user, '' when signed out. */
  address: string;
  /** Lowercased username, for surfaces that only know a handle. */
  username: string;
  /** Live badge balance, or undefined until it has been read. */
  balance?: number;
  /** True when `identifier` (username or address) names the signed-in user. */
  isSelf: (identifier?: string | null) => boolean;
}

/**
 * Read the live self balance without owning the fetch.
 *
 * Safe outside AuthProvider: badges render on surfaces that sit above it, and
 * `useAuth` throws there — so this reads the context directly and treats a
 * missing provider as "signed out".
 */
export function useSelfBadge(): SelfBadge {
  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;
  const address = normaliseId(auth?.walletAddress ?? user?.address);
  const username = normaliseId(user?.username);

  const { data } = useQuery({
    queryKey: [SELF_BADGE_QUERY_KEY, address],
    queryFn: () => readWalletDhb(address),
    // SelfBadgeSync owns the fetching. This observer only tracks its answer,
    // so mounting it on every name in a feed costs nothing.
    enabled: false,
    staleTime: Infinity,
  });

  const staked = useMemo(() => stakedFromUser(user), [user]);
  const balance = typeof data === 'number' && Number.isFinite(data) ? data + staked : undefined;

  return {
    address,
    username,
    balance,
    isSelf: (identifier?: string | null) => {
      if (balance === undefined) return false;
      const id = normaliseId(identifier);
      return !!id && (id === address || (!!username && id === username));
    },
  };
}

/**
 * Own the live self balance: fetch it, keep it fresh, hand it back.
 *
 * Mount this once (see `<SelfBadgeSync/>`). The interval is paused while the
 * tab is unfocused, and a focus refetch covers the common case where the buy
 * happened on a phone, an exchange, or another tab.
 */
export function useSelfBadgeBalance(): number | undefined {
  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;
  const address = normaliseId(auth?.walletAddress ?? user?.address);

  const { data } = useQuery({
    queryKey: [SELF_BADGE_QUERY_KEY, address],
    queryFn: () => readWalletDhb(address),
    enabled: !!address && !!auth?.isAuthenticated,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 90_000,
    // Two eth_calls a minute and a half is cheap while someone is looking at
    // the app; it is pure waste when the tab is in the background.
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const staked = useMemo(() => stakedFromUser(user), [user]);
  return typeof data === 'number' && Number.isFinite(data) ? data + staked : undefined;
}

/**
 * Call after a transaction that moves DHB into the signed-in wallet, so the
 * badge reflects it on the same beat as the balance rather than on the next
 * poll.
 */
export function invalidateSelfBadgeBalance(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: [SELF_BADGE_QUERY_KEY] });
}

/**
 * Resolve the balance a badge should draw for one name.
 *
 * `live` only ever wins by being bigger — see the module note.
 */
export function preferLiveBalance(
  server: number | string | null | undefined,
  live: number | undefined,
): number | undefined {
  const parsed = typeof server === 'string' ? parseFloat(server) : server;
  const numeric = typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
  if (live === undefined) return numeric;
  if (numeric === undefined) return live;
  return Math.max(numeric, live);
}
