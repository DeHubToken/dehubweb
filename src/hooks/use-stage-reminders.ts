/**
 * Stage reminders
 * ===============
 * One row per (stage, wallet): "tell me when this starts". Delivery is
 * entirely server-side — a DB trigger fans custom_notifications out the moment
 * the host takes the stage live, and a pg_cron pass catches "starting soon"
 * ten minutes ahead of scheduled_at — so the client's whole job is toggling
 * the row and reflecting whether one exists.
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
        .insert({ space_id: spaceId, wallet_address: walletAddress.toLowerCase() });
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
 */
const FACE_CANDIDATES = 12;
/** Avatars actually rendered; the rest live in the count. */
const FACES_SHOWN = 3;

export interface StageReminderFace {
  address: string;
  username?: string;
  avatarUrl?: string;
  followers: number;
}

/**
 * Who is waiting on a stage: a few faces plus the true total.
 *
 * Ordered by follower count because the point of the row is social proof —
 * a name you recognise is worth more than whoever happened to press the bell
 * first. Only the first FACE_CANDIDATES rows are ranked, so the faces are
 * "the biggest accounts among the earliest to remind", not a global top-N;
 * with the counts this feature sees, the distinction is theoretical.
 */
export function useStageReminderFaces(spaceId: string | undefined) {
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
  const faces = useMemo(
    () =>
      resolved
        .filter((face): face is StageReminderFace => !!face)
        .sort((a, b) => b.followers - a.followers)
        .slice(0, FACES_SHOWN),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(resolved)],
  );

  return { faces, total: reminders.data?.total ?? 0 };
}
