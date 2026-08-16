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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const stageReminderKeys = {
  all: ['stage-reminders'] as const,
  // Keyed by wallet so switching accounts cannot serve the previous one's row.
  forStage: (spaceId: string, wallet?: string | null) =>
    [...stageReminderKeys.all, spaceId, wallet?.toLowerCase() ?? null] as const,
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
