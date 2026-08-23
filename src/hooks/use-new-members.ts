/**
 * New Members
 * ===========
 * The member roster, newest joiner first — the same shape as "who to follow"
 * next to it, ordered by when people arrived instead of by who is suggested.
 *
 * It lives in Supabase (`public.new_members`) rather than being asked of the
 * DeHub API, because the API cannot answer it: `/api/users_search` ignores
 * `page`, `limit` and every sort parameter, and hands back the same ten oldest
 * accounts every time. The `register-new-member` edge function is the only
 * writer — see the migration for why `joined_at` is never taken from a client.
 *
 * There is deliberately no "joined in the last 30 days" filter on the list.
 * That filter is what made every surface read "Nobody new this month — yet":
 * the roster only knows the people it has been told about, so a window on top
 * of that is a window on a window. The 30-day figure still decides what is
 * called NEW — the profile chip, and the title a surface gives itself — but the
 * list itself simply runs newest to oldest until it runs out.
 *
 * Opting out is enforced by RLS, not here: an opted-out row is not selectable
 * by anyone but its owner, so every read below is already filtered.
 *
 * @module hooks/use-new-members
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { getAuthToken } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';

/** How long an account counts as new. Mirrors WINDOW_DAYS in the edge function. */
export const NEW_MEMBER_WINDOW_DAYS = 30;

const WINDOW_MS = NEW_MEMBER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Rows per page of the roster. Small enough that the first screen is quick. */
const PAGE_SIZE = 15;

/** Once per tab: registering twice in a session tells us nothing new. */
const REGISTERED_KEY = 'dehub_new_member_registered';

/** Once ever, per device: "you are visible on the roster, here is the off switch". */
const NOTICE_KEY = 'dehub_new_member_notice_seen';

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
  /** Denormalised at registration so a row draws its badge with no lookup. */
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

/** Did this person join recently enough to count as new, rather than just latest? */
export function isWithinNewWindow(joinedAt: string): boolean {
  return Date.now() - new Date(joinedAt).getTime() < WINDOW_MS;
}

/**
 * The roster, newest first, a page at a time.
 *
 * `excludeAddress` keeps you off your own list — seeing yourself among the
 * people you are being invited to follow is the kind of small wrongness that
 * makes a feature look unfinished.
 */
export function useNewMembers(excludeAddress?: string | null) {
  const exclude = excludeAddress?.toLowerCase() ?? null;

  return useInfiniteQuery({
    queryKey: ['new-members', exclude],
    queryFn: async ({ pageParam = 0 }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const { data, error } = await supabase
        .from('new_members')
        .select('wallet_address, username, display_name, avatar_url, badge_balance, joined_at')
        .order('joined_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      const rows = data || [];
      return {
        // Filtered after the page is cut, not before: dropping yourself must
        // not shift the window and skip somebody on the next page.
        items: rows.map(toNewMember).filter((m) => m.address.toLowerCase() !== exclude),
        hasMore: rows.length === PAGE_SIZE,
      };
    },
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length : undefined),
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Everyone inside the 30-day window, in one request.
 *
 * The chip used to answer "is this one person new" with a per-address query,
 * which was fine on a profile and ruinous on a feed: twenty cards meant twenty
 * requests for data one query already covers. This reads the whole window once
 * — small by construction, since only recent joiners are in it — and every
 * surface checks the map locally. Opted-out rows stay invisible here exactly
 * as they are everywhere else: RLS does not return them.
 *
 * PostgREST caps a single response at 1000 rows; if a month ever onboards more
 * than that, the oldest of them (the ones nearest graduating anyway) would stop
 * showing the chip until then.
 */
export function useNewMemberSet(): {
  members: Map<string, string>;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ['new-member-set'],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from('new_members')
        .select('wallet_address, joined_at')
        .gte('joined_at', cutoffIso());

      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data || []) {
        map.set((row.wallet_address as string).toLowerCase(), row.joined_at as string);
      }
      return map;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  return { members: query.data ?? EMPTY_MEMBER_SET, isLoading: query.isLoading };
}

const EMPTY_MEMBER_SET: Map<string, string> = new Map();

/**
 * Is this one person new? Now a local lookup in the shared window set, so the
 * profile chip and every feed surface read the same answer from the same
 * request. Keeps the 30-day cutoff the list has dropped: being on the roster
 * means we know when you joined, which is not the same as having just joined.
 *
 * Returns false for an opted-out member without needing to know that they
 * opted out — RLS simply does not return the row.
 */
export function useIsNewMember(address?: string | null) {
  const { members, isLoading } = useNewMemberSet();
  const key = address?.toLowerCase() ?? null;
  const joinedAt = (key && members.get(key)) || null;
  return { isNew: !!joinedAt, joinedAt, isLoading };
}

/**
 * Your own row, and the switch that hides it.
 *
 * Read with the wallet header on purpose: the SELECT policy hides opted-out
 * rows from everyone except their owner, so without the header this query
 * would report "not listed" the moment you switched the setting off, and the
 * toggle would spring back on.
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
      // The set feeds every chip in the app — profile included — so flipping
      // the switch has to drop it, or the old answer lingers for ten minutes.
      queryClient.invalidateQueries({ queryKey: ['new-member-set'] });
    },
  });

  // Having a row is what makes the switch worth showing, not being inside the
  // 30-day window: the roster lists the latest members whether or not they are
  // still "new", so somebody listed at 40 days must still be able to leave.
  const joinedAt = query.data?.joined_at ?? null;

  return {
    /** True whenever the setting still does something — see SettingsPage. */
    isNewMember: !!joinedAt,
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
 *
 * The same call is what fills the rest of the roster in — the function follows
 * the caller's own follower and following lists and the latest feed, and adds
 * whoever it finds. There is nothing to do here for that; it is deliberately
 * not the client's business which accounts get looked up.
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

        const result = data as { isListed?: boolean; isNew?: boolean; added?: number };
        // Anything the call added is somebody the roster did not have a moment
        // ago, so the list on screen is stale whether or not it added *you*.
        if (result?.isListed || result?.added) {
          queryClient.invalidateQueries({ queryKey: ['new-members'] });
          queryClient.invalidateQueries({ queryKey: ['new-member-self', walletAddress.toLowerCase()] });
        }

        // `isListed`, not `isNew`: the roster carries members whether or not
        // they are still inside the 30-day window, so the notice has to follow
        // being *on the list* — otherwise somebody listed at 40 days is never
        // told they are on it and never sees the way off.
        if (!result?.isListed) return;
        if (localStorage.getItem(NOTICE_KEY)) return;

        noticeTimer = setTimeout(() => {
          if (cancelled) return;
          localStorage.setItem(NOTICE_KEY, 'true');
          toast('You are showing in New members', {
            description: 'Other members can see when you joined, so they can say hello. Turn it off any time.',
            duration: 10_000,
            action: {
              label: 'Settings',
              onClick: () => navigate('/app/settings?tab=privacy'),
            },
          });
        }, NOTICE_DELAY_MS);
      } catch (err) {
        // Never surfaced: a roster missing one name is not worth an error on
        // top of someone's first login.
        console.warn('[NewMembers] register failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (noticeTimer) clearTimeout(noticeTimer);
    };
  }, [isAuthenticated, walletAddress, queryClient, navigate]);
}
