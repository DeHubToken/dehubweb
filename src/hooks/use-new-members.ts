/**
 * New Members
 * ===========
 * Who joined DeHub recently, so the people already here can say hello.
 *
 * The roster lives in Supabase (`public.new_members`) rather than being asked
 * of the DeHub API, because the API cannot answer it: `/api/users_search`
 * ignores `page`, `limit` and every sort parameter, and hands back the same ten
 * oldest accounts every time. The `register-new-member` edge function is the
 * only writer — see the migration for why `joined_at` is never taken from a
 * client.
 *
 * Opting out is enforced by RLS, not here: an opted-out row is not selectable
 * by anyone but its owner, so every read below is already filtered.
 *
 * @module hooks/use-new-members
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { getAuthToken } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';

/** How long an account counts as new. Mirrors WINDOW_DAYS in the edge function. */
export const NEW_MEMBER_WINDOW_DAYS = 30;

const WINDOW_MS = NEW_MEMBER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Once per tab: registering twice in a session tells us nothing new. */
const REGISTERED_KEY = 'dehub_new_member_registered';

/** Once ever, per device: "you are visible as new, here is the off switch". */
const NOTICE_KEY = 'dehub_new_member_notice_seen';

/** Addresses this device has already put to the seeder — see useSeedNewMembers. */
const SEEDED_KEY = 'dehub_new_member_seeded';

/** Addresses sent per seed call. Mirrors SEED_LIMIT in the edge function. */
const SEED_BATCH = 25;

/** Remembered addresses kept before the oldest are dropped. */
const SEEDED_CAP = 500;

/**
 * How long to wait before telling someone they are on the roster.
 *
 * The setting is on by default, which the feature request asked for — but
 * default-on means the first anyone hears of it should not be someone else's
 * DM. It has to wait, though: a brand new account is looking at a username
 * prompt and a "Welcome to DeHub!" toast at this moment, and a third thing on
 * top of those is noise nobody reads.
 */
const NOTICE_DELAY_MS = 12_000;

export interface NewMember {
  address: string;
  username: string | null;
  displayName: string;
  avatarUrl?: string;
  /** Denormalised at registration so a rail row draws its badge with no lookup. */
  badgeBalance: number;
  joinedAt: string;
}

function cutoffIso(): string {
  return new Date(Date.now() - WINDOW_MS).toISOString();
}

function toNewMember(row: {
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  joined_at: string;
}): NewMember {
  return {
    address: row.wallet_address,
    username: row.username,
    displayName: row.display_name || row.username || `${row.wallet_address.slice(0, 6)}…${row.wallet_address.slice(-4)}`,
    avatarUrl: buildAvatarUrl(row.wallet_address, row.avatar_url || undefined, 96),
    badgeBalance: row.badge_balance ?? 0,
    joinedAt: row.joined_at,
  };
}

/** "2 hours ago" / "3 days ago" — deliberately coarse; nobody needs minutes. */
export function joinedAgoLabel(joinedAt: string): string {
  const ms = Date.now() - new Date(joinedAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/**
 * The roster, newest first.
 *
 * `excludeAddress` keeps you off your own welcome list — seeing yourself in
 * "say hello to these people" is the kind of small wrongness that makes a
 * feature look unfinished.
 */
export function useNewMembers(limit = 30, excludeAddress?: string | null) {
  const exclude = excludeAddress?.toLowerCase() ?? null;

  return useQuery({
    // `exclude` belongs in the key rather than in a `select`: an inline select
    // is re-run on every render and hands back a fresh array each time, which
    // is a new `data` identity for anything downstream to react to.
    queryKey: ['new-members', limit, exclude],
    queryFn: async (): Promise<NewMember[]> => {
      const { data, error } = await supabase
        .from('new_members')
        .select('wallet_address, username, display_name, avatar_url, badge_balance, joined_at')
        .gte('joined_at', cutoffIso())
        .order('joined_at', { ascending: false })
        .limit(limit + 1);

      if (error) throw error;
      return (data || [])
        .map(toNewMember)
        .filter((member) => member.address.toLowerCase() !== exclude)
        .slice(0, limit);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Is this one person new? Used by the profile chip.
 *
 * Returns false for an opted-out member without needing to know that they
 * opted out — RLS simply does not return the row.
 */
export function useIsNewMember(address?: string | null) {
  const query = useQuery({
    queryKey: ['new-member', address?.toLowerCase()],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('new_members')
        .select('joined_at')
        .eq('wallet_address', address!.toLowerCase())
        .gte('joined_at', cutoffIso())
        .maybeSingle();

      if (error) throw error;
      return data?.joined_at ?? null;
    },
    enabled: !!address,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // An unknown address is a normal answer here, not a fault worth retrying.
    retry: false,
  });

  return { isNew: !!query.data, joinedAt: query.data ?? null, isLoading: query.isLoading };
}

/**
 * Your own row, and the switch that hides it.
 *
 * Read with the wallet header on purpose: the SELECT policy hides opted-out
 * rows from everyone except their owner, so without the header this query
 * would report "not a new member" the moment you switched the setting off, and
 * the toggle would spring back on.
 */
export function useNewMemberSelf() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const address = walletAddress?.toLowerCase() ?? null;

  const query = useQuery({
    queryKey: ['new-member-self', address],
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase
          .from('new_members')
          .select('joined_at, opted_out')
          .eq('wallet_address', address!),
        address,
      ).maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
    enabled: !!address,
    staleTime: 60 * 1000,
    retry: false,
  });

  const setOptedOut = useMutation({
    mutationFn: async (optedOut: boolean) => {
      const { error } = await withWalletHeader(
        supabase.from('new_members').update({ opted_out: optedOut }).eq('wallet_address', address!),
        address,
      );
      if (error) throw error;
      return optedOut;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['new-member-self', address] });
      queryClient.invalidateQueries({ queryKey: ['new-members'] });
      if (address) queryClient.invalidateQueries({ queryKey: ['new-member', address] });
    },
  });

  const joinedAt = query.data?.joined_at ?? null;
  const withinWindow = !!joinedAt && Date.now() - new Date(joinedAt).getTime() < WINDOW_MS;

  return {
    /** True only while the setting still does something — see SettingsPage. */
    isNewMember: withinWindow,
    joinedAt,
    optedOut: query.data?.opted_out ?? false,
    isLoading: query.isLoading,
    setOptedOut: setOptedOut.mutateAsync,
    isUpdating: setOptedOut.isPending,
  };
}

/**
 * Put the signed-in account on the roster, once per session.
 *
 * Mounted high in the app rather than called from AuthProvider: this is a
 * cosmetic side effect, and a failure in it must never be able to interrupt a
 * login. Everything it needs is derived server-side from the DeHub token, so
 * there is nothing to pass and nothing to get wrong.
 */
export function useRegisterNewMember() {
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;
    if (sessionStorage.getItem(REGISTERED_KEY) === walletAddress.toLowerCase()) return;

    const token = getAuthToken();
    if (!token) return;

    let cancelled = false;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('register-new-member', {
          headers: {
            'x-wallet-address': walletAddress.toLowerCase(),
            'x-dehub-token': token,
          },
        });
        if (cancelled) return;
        if (error) throw error;

        sessionStorage.setItem(REGISTERED_KEY, walletAddress.toLowerCase());
        if (!(data as { isNew?: boolean })?.isNew) return;

        queryClient.invalidateQueries({ queryKey: ['new-members'] });
        queryClient.invalidateQueries({ queryKey: ['new-member-self', walletAddress.toLowerCase()] });

        if (localStorage.getItem(NOTICE_KEY)) return;
        noticeTimer = setTimeout(() => {
          if (cancelled) return;
          localStorage.setItem(NOTICE_KEY, 'true');
          toast('You are showing as a new member', {
            description: 'Other members can see you just joined, so they can say hello. Turn it off any time.',
            duration: 10_000,
            action: {
              label: 'Settings',
              onClick: () => navigate('/app/settings?tab=privacy'),
            },
          });
        }, NOTICE_DELAY_MS);
      } catch (err) {
        // Never surfaced: a welcome rail missing one name is not worth an error
        // on top of someone's first login.
        console.warn('[NewMembers] register failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (noticeTimer) clearTimeout(noticeTimer);
    };
  }, [isAuthenticated, walletAddress, queryClient, navigate]);
}

function readSeeded(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEDED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

function rememberSeeded(addresses: string[], current: Set<string>) {
  const next = [...current, ...addresses];
  try {
    localStorage.setItem(SEEDED_KEY, JSON.stringify(next.slice(-SEEDED_CAP)));
  } catch {
    // Private-mode storage failure only costs a repeated check.
  }
}

/**
 * Point the seeder at accounts the app is already showing.
 *
 * Sign-in registration alone builds the roster far too slowly — it only ever
 * learns about people who came back after the feature shipped, so a month of
 * real joiners stays invisible behind "Nobody new this month — yet". The
 * addresses the feed is already rendering are the one list of recently-active
 * accounts a client can see, so they are worth asking about.
 *
 * Nothing here is trusted: the edge function re-reads every candidate from
 * api.dehub.io and roster it only if that record says they joined inside the
 * window. This hook's job is purely to keep the asking cheap — addresses
 * already submitted from this device are never sent twice, and only one batch
 * goes per mount.
 */
export function useSeedNewMembers(addresses: string[] | undefined) {
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    if (!isAuthenticated || !walletAddress) return;
    if (!addresses || addresses.length === 0) return;

    const token = getAuthToken();
    if (!token) return;

    const seeded = readSeeded();
    const self = walletAddress.toLowerCase();
    const candidates: string[] = [];
    for (const address of addresses) {
      const lower = address?.toLowerCase();
      if (!lower || lower === self || seeded.has(lower)) continue;
      if (!/^0x[a-f0-9]{40}$/.test(lower)) continue;
      if (candidates.includes(lower)) continue;
      candidates.push(lower);
      if (candidates.length >= SEED_BATCH) break;
    }
    if (candidates.length === 0) return;

    sentRef.current = true;
    // Remembered before the call, not after: a failed batch is not worth
    // retrying on every feed page, and the next mount has fresh addresses.
    rememberSeeded(candidates, seeded);

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('register-new-member', {
          body: { candidates },
          headers: {
            'x-wallet-address': self,
            'x-dehub-token': token,
          },
        });
        if (cancelled || error) return;
        if ((data as { added?: number })?.added) {
          queryClient.invalidateQueries({ queryKey: ['new-members'] });
        }
      } catch (err) {
        // Silent by design — this is a background top-up of a welcome rail.
        console.warn('[NewMembers] seed failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addresses, isAuthenticated, walletAddress, queryClient]);
}
