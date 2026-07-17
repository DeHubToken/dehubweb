import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface SavedAddress {
  id: string;
  wallet_address: string;
  label: string;
  full_name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

export function useSavedAddresses() {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['saved-addresses', walletAddress],
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase.from('saved_addresses').select('*').eq('wallet_address', walletAddress!.toLowerCase()).order('is_default', { ascending: false }),
        walletAddress!
      );
      if (error) throw error;
      return (data || []) as SavedAddress[];
    },
    enabled: !!walletAddress,
  });
}

export function useSaveAddress() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Omit<SavedAddress, 'id' | 'wallet_address'>) => {
      if (!walletAddress) throw new Error('Not authenticated');
      // If setting as default, unset others first
      if (params.is_default) {
        await withWalletHeader(
          supabase.from('saved_addresses').update({ is_default: false } as any).eq('wallet_address', walletAddress.toLowerCase()),
          walletAddress
        );
      }
      const { data, error } = await withWalletHeader(
        supabase.from('saved_addresses').insert({
          ...params,
          wallet_address: walletAddress.toLowerCase(),
        } as any).select().single(),
        walletAddress
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-addresses'] });
      toast.success('Address saved!');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteAddress() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await withWalletHeader(
        supabase.from('saved_addresses').delete().eq('id', id),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-addresses'] });
      toast.success('Address deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
