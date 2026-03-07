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
  // Any disable entry means DMs are closed
  return 'none';
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
        return response?.result || response || {};
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

  // Update DM settings via POST /api/dm/user-status/{address}
  const updateMutation = useMutation({
    mutationFn: async (payload: { status: string; action: string; perMessageFee?: number }) => {
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

  return {
    whoCanMessage,
    messageFee,
    doNotDisturb,
    isLoading,
    isUpdating: updateMutation.isPending,
    updateWhoCanMessage: (value: WhoCanMessage) => {
      const payload = toStatusPayload(value);
      updateMutation.mutate(payload);
    },
    updateMessageFee: (fee: number) => {
      const currentPayload = toStatusPayload(whoCanMessage);
      updateMutation.mutate({ ...currentPayload, perMessageFee: fee });
    },
    updateDoNotDisturb: (enabled: boolean) => {
      setDoNotDisturbLocal(enabled);
      try { localStorage.setItem('dehub_dnd', String(enabled)); } catch {}
      toast.success('DM settings updated');
    },
  };
}
