/**
 * Stage reminders
 * ===============
 * One row per (stage, wallet): "tell me when this starts". Delivery is
 * entirely server-side — a DB trigger fans custom_notifications out the moment
 * the host takes the stage live, and a pg_cron pass catches "starting soon"
 * ten minutes ahead of scheduled_at — so the client's job is toggling the row,
 * reflecting whether one exists, and reading the set back out: the rows outlive
 * the scheduled → live flip, which is what lets a room that has just opened
 * show its pre-audience (see useStagePreAudience).
 *
 * DELETE on stage_reminders is gated on get_request_wallet_address(), which
 * reads the x-wallet-address header the plain client never sends — hence the
 * explicit .setHeader on the un-remind path, same as cancelScheduledSpace.
 */

import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getAccountInfo } from '@/lib/api/dehub';
import { mapUserToProfile } from '@/hooks/use-dehub-profile';
import { toast } from 'sonner';

const stageReminderKeys = {
  all: ['stage-reminders'] as const,
  // Keyed by wallet so switching accounts cannot serve the previous one's row.
  forStage: (spaceId: string, wallet?: string | null) =>
    [...stageReminderKeys.all, spaceId, wallet?.toLowerCase() ?? null] as const,
  facesForStage: (spaceId: string) => [...stageReminderKeys.all, 'faces', spaceId] as const,
};

export function useStageReminder(spaceId: string | undefined) {
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: stageReminderKeys.forStage(spaceId ?? '', walletAddress),
    enabled: !!spaceId && isAuthenticated && !!walletAddress,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_reminders')
        .select('id')
        .eq('space_id', spaceId!)
        .eq('wallet_address', walletAddress!.toLowerCase())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (): Promise<boolean | undefined> => {
      if (!spaceId || !walletAddress) return undefined;
      if (query.data) {
        const { error } = await supabase
          .from('stage_reminders')
          .delete()
          .eq('space_id', spaceId)
          .eq('wallet_address', walletAddress.toLowerCase())
          .setHeader('x-wallet-address', walletAddress.toLowerCase());
        if (error) throw error;
        return false;
      }
      const { error } = await supabase
        .from('stage_reminders')
        .insert({ space_id: spaceId, wallet_address: walletAddress.toLowerCase() })
        // The same header the un-remind path above already sends. INSERT was
        // `WITH CHECK (true)`, so a reminder could be set in anyone's name;
        // once the policy checks the wallet, a bell press without this is
        // refused.
        .setHeader('x-wallet-address', walletAddress.toLowerCase());
      if (error) throw error;
      return true;
    },
    onSuccess: (nowSet) => {
      void queryClient.invalidateQueries({ queryKey: stageReminderKeys.all });
      if (nowSet === true) toast.success("Reminder set — you'll be notified when it starts");
      if (nowSet === false) toast.success('Reminder removed');
    },
    onError: () => toast.error('Could not update the reminder'),
  });

  return {
    /** Whether the signed-in wallet holds a reminder for this stage. */
    hasReminder: !!query.data,
    isLoading: query.isLoading,
    toggleReminder: () => toggle.mutate(),
    isToggling: toggle.isPending,
  };
}

/**
 * How many candidate reminders we pull profiles for. There is no batch
 * profile endpoint — `getAccountInfo` is one request per address — so this is
 * a request budget, not a display limit. The total count comes from the
 * `count: 'exact'` head on the same query, so it stays honest however many
 * rows exist beyond this window.
 *
 * Both consumers (the announcement facepile and the live room's pre-audience)
 * ask for the same window so they share one fan-out: the profile queries are
 * keyed by address, so the second surface to mount pays nothing.
 */
const FACE_CANDIDATES = 12;
/** Avatars actually rendered; the rest live in the count. */
const FACES_SHOWN = 3;
/** Pre-audience avatars in the live room — the crowd has room for all of them. */
const PRE_AUDIENCE_SHOWN = FACE_CANDIDATES;

export interface StageReminderFace {
  address: string;
  username?: string;
  avatarUrl?: string;
  followers: number;
}

/**
 * Everyone who set a reminder on a stage, resolved and ranked by followers.
 *
 * Follower order because the point of every surface built on this is social
 * proof — a name you recognise is worth more than whoever happened to press
 * the bell first. Only the first FACE_CANDIDATES rows are ranked, so the faces
 * are "the biggest accounts among the earliest to remind", not a global top-N;
 * with the counts this feature sees, the distinction is theoretical.
 */
function useStageReminderRoster(spaceId: string | undefined) {
  const reminders = useQuery({
    queryKey: stageReminderKeys.facesForStage(spaceId ?? ''),
    enabled: !!spaceId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('stage_reminders')
        .select('wallet_address', { count: 'exact' })
        .eq('space_id', spaceId!)
        .order('created_at', { ascending: true })
        .limit(FACE_CANDIDATES);
      if (error) throw error;
      return {
        addresses: (data ?? []).map((row) => row.wallet_address).filter(Boolean),
        total: count ?? 0,
      };
    },
  });

  const addresses = reminders.data?.addresses ?? [];

  // One request per address (no batch endpoint exists) — the same fan-out
  // shape use-community-chat uses, with a long staleTime so a card scrolling
  // back into view costs nothing. A failed lookup drops that face rather than
  // the row.
  const profiles = useQueries({
    queries: addresses.map((address) => ({
      queryKey: ['dehub-profile-lite', address.toLowerCase()],
      staleTime: 30 * 60_000,
      queryFn: async (): Promise<StageReminderFace | null> => {
        try {
          const profile = mapUserToProfile(await getAccountInfo(address));
          return {
            address,
            username: profile.handle || profile.name || undefined,
            avatarUrl: profile.avatarUrl || undefined,
            followers: profile.followers ?? 0,
          };
        } catch {
          return null;
        }
      },
    })),
  });

  // Depend on the resolved data, not the query objects — useQueries hands back
  // a fresh array identity every render.
  const resolved = profiles.map((q) => q.data);
  const ranked = useMemo(
    () =>
      resolved
        .filter((face): face is StageReminderFace => !!face)
        .sort((a, b) => b.followers - a.followers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(resolved)],
  );

  return { ranked, candidates: addresses, total: reminders.data?.total ?? 0 };
}

/** Who is waiting on an announced stage: a few faces plus the true total. */
export function useStageReminderFaces(spaceId: string | undefined) {
  const { ranked, total } = useStageReminderRoster(spaceId);
  const faces = useMemo(() => ranked.slice(0, FACES_SHOWN), [ranked]);
  return { faces, total };
}

/**
 * The pre-audience: people who said they were coming and are not in the room
 * yet.
 *
 * A stage that has just gone live is empty by definition — the host is talking
 * to nobody for the first minute or two while the notification lands and people
 * open it. Everyone holding a reminder already told us they intend to be there,
 * so the crowd shows them from the moment the room opens, and each one drops
 * out of the pre-audience the instant they actually walk in.
 *
 * Deliberately render-only. Writing `space_participants` rows for them instead
 * would look identical and break three things at once: the auto-end trigger
 * treats any row with a null `left_at` as somebody still in the room (so a
 * stage with a pre-audience could never end empty), every headcount is
 * recounted from those rows on join and leave (so the inflation would outlive
 * the stage and land in the attendance figure on the recording), and a host
 * could "invite as speaker" a wallet that has no Agora connection to promote.
 */
export function useStagePreAudience(
  spaceId: string | undefined,
  /** Wallets currently in the room, any role — pass `participants`. */
  joinedAddresses: string[],
) {
  const { ranked, candidates, total } = useStageReminderRoster(spaceId);

  // Callers map this out of participant state, so the array identity churns on
  // every realtime tick; the joined *set* only changes when someone comes or
  // goes.
  const joinedKey = joinedAddresses.join(',').toLowerCase();

  return useMemo(() => {
    const joined = new Set(joinedKey ? joinedKey.split(',') : []);
    const waiting = ranked
      .filter((face) => !joined.has(face.address.toLowerCase()))
      .slice(0, PRE_AUDIENCE_SHOWN);

    // Reminder-holders who are known to have arrived leave the pre-audience
    // entirely rather than moving to the overflow chip. Only the fetched window
    // can be checked against the room, which is why the subtraction is scoped
    // to it — beyond FACE_CANDIDATES we have a count and nothing else.
    const arrived = candidates.filter((address) => joined.has(address.toLowerCase())).length;
    const waitingTotal = Math.max(0, total - arrived);

    return {
      /** Faces to render alongside the real listeners. */
      waiting,
      /** Everyone still expected, including those with no face resolved. */
      waitingTotal,
      /** Expected but not rendered — a profile that failed, or past the window. */
      overflow: Math.max(0, waitingTotal - waiting.length),
    };
  }, [ranked, candidates, total, joinedKey]);
}
