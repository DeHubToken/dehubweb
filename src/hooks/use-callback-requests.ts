import { useState, useEffect, useCallback } from 'react';
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
  const [pendingRequests, setPendingRequests] = useState<CallbackRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<CallbackRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { walletAddress: userAddress } = useAuth();

  const fetchRequests = useCallback(async () => {
    if (!userAddress) return;

    try {
      setIsLoading(true);

      const { data: pending, error: pendingError } = await supabase
        .from('callback_requests')
        .select('*')
        .eq('recipient_address', userAddress)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (pendingError) {
        console.error('Error fetching pending requests:', pendingError);
      } else {
        setPendingRequests((pending || []) as CallbackRequest[]);
      }

      const { data: sent, error: sentError } = await supabase
        .from('callback_requests')
        .select('*')
        .eq('requester_address', userAddress)
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
  }, [userAddress]);

  const sendCallbackRequest = useCallback(
    async (recipientAddress: string, callType: 'audio' | 'video', message?: string): Promise<boolean> => {
      if (!userAddress) return false;

      try {
        const { error } = await supabase.from('callback_requests').insert({
          requester_address: userAddress,
          recipient_address: recipientAddress,
          call_type: callType,
          message: message || null,
          status: 'pending',
        });

        if (error) {
          console.error('Error sending callback request:', error);
          toast.error('Failed to send request', { description: 'Could not send callback request. Please try again.' });
          return false;
        }

        toast.success('Callback request sent', {
          description: `${callType === 'video' ? 'Video' : 'Voice'} call request sent successfully.`,
        });

        await fetchRequests();
        return true;
      } catch (error) {
        console.error('Error sending callback request:', error);
        return false;
      }
    },
    [userAddress, fetchRequests],
  );

  const markAsCompleted = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('callback_requests').update({ status: 'completed' }).eq('id', requestId);

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
  }, []);

  useEffect(() => {
    if (!userAddress) return;

    const channel = supabase
      .channel('callback_requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'callback_requests',
          filter: `recipient_address=eq.${userAddress}`,
        },
        (payload) => {
          const newRequest = payload.new as CallbackRequest;
          setPendingRequests((prev) => [newRequest, ...prev]);

          toast.info('New callback request', {
            description: `${newRequest.call_type === 'video' ? 'Video' : 'Voice'} call request from ${newRequest.requester_address.slice(0, 6)}...`,
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'callback_requests',
          filter: `recipient_address=eq.${userAddress}`,
        },
        (payload) => {
          const updatedRequest = payload.new as CallbackRequest;
          if (updatedRequest.status === 'completed') {
            setPendingRequests((prev) => prev.filter((req) => req.id !== updatedRequest.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userAddress]);

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
