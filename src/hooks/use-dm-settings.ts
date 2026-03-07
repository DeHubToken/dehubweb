import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { updateProfile } from '@/lib/api/dehub';
import { toast } from 'sonner';

export type WhoCanMessage = 'everyone' | 'followers' | 'none';

interface DmSettingsState {
  whoCanMessage: WhoCanMessage;
  messageFee: number; // minTipDhb in DHB
  doNotDisturb: boolean;
}

/**
 * Derives the WhoCanMessage value from the API's dmSettings.disables array.
 * - disables includes 'all' → 'none'
 * - disables includes 'non-followers' → 'followers'
 * - empty/undefined → 'everyone'
 */
function deriveWhoCanMessage(disables?: string[]): WhoCanMessage {
  if (!disables || disables.length === 0) return 'everyone';
  if (disables.includes('all')) return 'none';
  if (disables.includes('non-followers')) return 'followers';
  return 'everyone';
}

/**
 * Converts UI WhoCanMessage value back to the API disables array.
 */
function toDisables(value: WhoCanMessage): string[] {
  switch (value) {
    case 'none': return ['all'];
    case 'followers': return ['non-followers'];
    case 'everyone':
    default: return [];
  }
}

export function useDmSettings() {
  const { user, walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useDeHubProfile({
    userId: walletAddress || undefined,
    enabled: !!walletAddress && isAuthenticated,
  });

  const dmSettings = profile?.dmSettings;

  const whoCanMessage = deriveWhoCanMessage(dmSettings?.disables);
  const messageFee = dmSettings?.minTipDhb ?? 0;
  // Do Not Disturb is stored in customs
  const doNotDisturb = profile?.customs?.doNotDisturb === true || profile?.customs?.doNotDisturb === 'true';

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<DmSettingsState>) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const currentDisables = dmSettings?.disables || [];
      const currentMinTip = dmSettings?.minTipDhb ?? 0;

      const newDmSettings: { disables: string[]; minTipDhb: number } = {
        disables: updates.whoCanMessage !== undefined
          ? toDisables(updates.whoCanMessage)
          : currentDisables,
        minTipDhb: updates.messageFee !== undefined
          ? updates.messageFee
          : currentMinTip,
      };

      const profileUpdate: Record<string, any> = {
        dmSettings: newDmSettings,
      };

      // Handle Do Not Disturb via customs
      if (updates.doNotDisturb !== undefined) {
        const existingCustoms = (profile?.customs ?? {}) as Record<string, string>;
        profileUpdate.customs = {
          ...existingCustoms,
          doNotDisturb: String(updates.doNotDisturb),
        };
      }

      await updateProfile(profileUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      toast.success('DM settings updated');
    },
    onError: (error) => {
      console.error('Failed to update DM settings:', error);
      toast.error('Failed to update DM settings');
    },
  });

  return {
    whoCanMessage,
    messageFee,
    doNotDisturb,
    isLoading,
    isUpdating: updateMutation.isPending,
    updateWhoCanMessage: (value: WhoCanMessage) => updateMutation.mutate({ whoCanMessage: value }),
    updateMessageFee: (fee: number) => updateMutation.mutate({ messageFee: fee }),
    updateDoNotDisturb: (enabled: boolean) => updateMutation.mutate({ doNotDisturb: enabled }),
  };
}
