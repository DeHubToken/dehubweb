import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

export interface CustomVoice {
  id: string;
  wallet_address: string;
  elevenlabs_voice_id: string;
  name: string;
  created_at: string;
}

export function useCustomVoices() {
  const { walletAddress } = useAuth();
  const [voices, setVoices] = useState<CustomVoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchVoices = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoading(true);
    try {
      const { data, error } = await withWalletHeader(
        supabase.from('custom_voices').select('*').order('created_at', { ascending: false }),
        walletAddress
      );
      if (error) throw error;
      setVoices((data as unknown as CustomVoice[]) || []);
    } catch (err) {
      console.error('Failed to fetch custom voices:', err);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  const deleteVoice = useCallback(async (id: string) => {
    if (!walletAddress) return;
    try {
      const { error } = await withWalletHeader(
        supabase.from('custom_voices').delete().eq('id', id),
        walletAddress
      );
      if (error) throw error;
      setVoices(prev => prev.filter(v => v.id !== id));
    } catch (err) {
      console.error('Failed to delete custom voice:', err);
    }
  }, [walletAddress]);

  return { voices, isLoading, refetch: fetchVoices, deleteVoice };
}
