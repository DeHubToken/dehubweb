import { walletScopedClient } from '@/lib/supabase-wallet-client';
import { useTranslation as _useCopy } from 'react-i18next';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface CallbackRequest {
  id: string;
  requester_address: string;
  recipient_address: string;
  call_type: 'audio' | 'video';
  message?: string;
  status: 'pending' | 'completed' | 'expired';
  created_at: string;
  expires_at: string;
  updated_at: string;
}

export interface UseCallbackRequestsReturn {
  pendingRequests: CallbackRequest[];
  sentRequests: CallbackRequest[];
  isLoading: boolean;
  sendCallbackRequest: (recipientAddress: string, callType: 'audio' | 'video', message?: string) => Promise<boolean>;
  markAsCompleted: (requestId: string) => Promise<boolean>;
  fetchRequests: () => Promise<void>;
}

export function useCallbackRequests(): UseCallbackRequestsReturn {
  const { t: _copy } = _useCopy();
  const [pendingRequests, setPendingRequests] = useState<CallbackRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<CallbackRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { walletAddress: userAddress } = useAuth();
  const callClient = useMemo(() => userAddress ? walletScopedClient(userAddress) : supabase, [userAddress]);

  const fetchRequests = useCallback(async () => {
    if (!userAddress) return;

    try {
      setIsLoading(true);

      const { data: pending, error: pendingError } = await callClient
        .from('callback_requests')
        .select('*')
        .eq('recipient_address', userAddress.toLowerCase())
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (pendingError) {
        console.error('Error fetching pending requests:', pendingError);
      } else {
        setPendingRequests((pending || []) as CallbackRequest[]);
      }

      const { data: sent, error: sentError } = await callClient
        .from('callback_requests')
        .select('*')
        .eq('requester_address', userAddress.toLowerCase())
        .in('status', ['pending', 'completed'])
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (sentError) {
        console.error('Error fetching sent requests:', sentError);
      } else {
        setSentRequests((sent || []) as CallbackRequest[]);
      }
    } catch (error) {
      console.error('Error fetching callback requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, callClient]);

  const sendCallbackRequest = useCallback(
    async (recipientAddress: string, callType: 'audio' | 'video', message?: string): Promise<boolean> => {
      if (!userAddress) return false;

      try {
        const { error } = await callClient.from('callback_requests').insert({
          requester_address: userAddress.toLowerCase(),
          recipient_address: recipientAddress.toLowerCase(),
          call_type: callType,
          message: message || null,
          status: 'pending',
        });

        if (error) {
          console.error('Error sending callback request:', error);
          toast.error(_copy("copy.f33fbd2e4fd9", { defaultValue: "Failed to send request" }), { description: _copy("copy.9b06d5312dc2", { defaultValue: "Could not send callback request. Please try again." }) });
          return false;
        }

        toast.success(_copy("copy.b550c225bba9", { defaultValue: "Callback request sent" }), {
          description: `${callType === 'video' ? 'Video' : 'Voice'} call request sent successfully.`,
        });

        await fetchRequests();
        return true;
      } catch (error) {
        console.error('Error sending callback request:', error);
        return false;
      }
    },
    [userAddress, callClient, fetchRequests, _copy],
  );

  const markAsCompleted = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      const { error } = await callClient.from('callback_requests').update({ status: 'completed' }).eq('id', requestId);

      if (error) {
        console.error('Error marking request as completed:', error);
        return false;
      }

      setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
      setSentRequests((prev) =>
        prev.map((req) => (req.id === requestId ? { ...req, status: 'completed' as const } : req)),
      );

      return true;
    } catch (error) {
      console.error('Error marking request as completed:', error);
      return false;
    }
  }, [callClient]);

  useEffect(() => {
    if (!userAddress) return;

    const refresh = () => { if (document.visibilityState === 'visible') void fetchRequests(); };
    const timer = setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [userAddress, fetchRequests]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  return {
    pendingRequests,
    sentRequests,
    isLoading,
    sendCallbackRequest,
    markAsCompleted,
    fetchRequests,
  };
}
