import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { apiCall } from '@/lib/api/dehub/core';
import { toast } from 'sonner';

export type WhoCanMessage = 'everyone' | 'none';

interface DmStatusResponse {
  disables?: string[];
  perMessageFee?: number;
  freeAccessUsers?: string[];
}

/**
 * Derives the WhoCanMessage value from the API's disables array.
 */
function deriveWhoCanMessage(disables?: string[]): WhoCanMessage {
  if (!disables || disables.length === 0) return 'everyone';
  // ACTIVE_ALL means DMs are open; only treat as closed if a disable entry is present
  const hasDisable = disables.some(d => !d.startsWith('ACTIVE'));
  return hasDisable ? 'none' : 'everyone';
}

/**
 * Maps WhoCanMessage back to API payload.
 */
function toStatusPayload(value: WhoCanMessage): { status: string; action: string } {
  switch (value) {
    case 'none':
      return { status: 'NEW_DM', action: 'disable' };
    case 'everyone':
    default:
      return { status: 'NEW_DM', action: 'enable' };
  }
}

export function useDmSettings() {
  const { walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Fetch current DM status from the dedicated endpoint
  const { data: dmStatus, isLoading } = useQuery({
    queryKey: ['dm-user-status', walletAddress],
    queryFn: async (): Promise<DmStatusResponse> => {
      if (!walletAddress) return {};
      try {
        const response = await apiCall<any>(`/api/dm/user-status/${walletAddress.toLowerCase()}`, {
          method: 'GET',
          requiresAuth: true,
        });
        return response?.data || response?.result || response || {};
      } catch (error) {
        console.error('[useDmSettings] Failed to fetch DM status:', error);
        return {};
      }
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 30_000,
  });

  const whoCanMessage = deriveWhoCanMessage(dmStatus?.disables);
  const messageFee = dmStatus?.perMessageFee ?? 0;
  // Do Not Disturb is a local concept we can keep in localStorage
  const [doNotDisturb, setDoNotDisturbLocal] = useState(() => {
    try { return localStorage.getItem('dehub_dnd') === 'true'; } catch { return false; }
  });

  // Update DM status (who can message)
  const updateMutation = useMutation({
    mutationFn: async (payload: { status: string; action: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      await apiCall<any>(`/api/dm/user-status/${walletAddress.toLowerCase()}`, {
        method: 'POST',
        body: payload,
        requiresAuth: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dm-user-status', walletAddress] });
      toast.success('DM settings updated');
    },
    onError: (error) => {
      console.error('[useDmSettings] Failed to update DM settings:', error);
      toast.error('Failed to update DM settings');
    },
  });

  // Update fee — API requires status+action in every POST. Include current DM access state.
  const updateFeeMutation = useMutation({
    mutationFn: async (fee: number) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const payload = toStatusPayload(whoCanMessage);
      await apiCall<any>(`/api/dm/user-status/${walletAddress.toLowerCase()}`, {
        method: 'POST',
        body: { ...payload, perMessageFee: fee },
        requiresAuth: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dm-user-status', walletAddress] });
      toast.success('DM settings updated');
    },
    onError: (error) => {
      console.error('[useDmSettings] Failed to update fee:', error);
      toast.error('Failed to update message fee');
    },
  });

  return {
    whoCanMessage,
    messageFee,
    doNotDisturb,
    isLoading,
    isUpdating: updateMutation.isPending || updateFeeMutation.isPending,
    updateWhoCanMessage: (value: WhoCanMessage) => {
      const payload = toStatusPayload(value);
      updateMutation.mutate(payload);
    },
    updateMessageFee: (fee: number) => {
      updateFeeMutation.mutate(fee);
    },
    updateDoNotDisturb: (enabled: boolean) => {
      setDoNotDisturbLocal(enabled);
      try { localStorage.setItem('dehub_dnd', String(enabled)); } catch {}
      toast.success('DM settings updated');
    },
  };
}
