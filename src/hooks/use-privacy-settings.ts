import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

export interface PrivacySettings {
  id: string;
  wallet_address: string;
  show_followers_following: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to manage the current user's privacy settings
 */
export function usePrivacySettings() {
  const { walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const lowerAddress = walletAddress?.toLowerCase();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['privacy-settings', lowerAddress],
    queryFn: async (): Promise<PrivacySettings | null> => {
      if (!lowerAddress) return null;

      const query = supabase
        .from('user_privacy_settings')
        .select('*')
        .eq('wallet_address', lowerAddress)
        .maybeSingle();

      const { data, error } = await withWalletHeader(query, lowerAddress);

      if (error) {
        console.error('Failed to fetch privacy settings:', error);
        return null;
      }

      return data as PrivacySettings | null;
    },
    enabled: !!lowerAddress && isAuthenticated,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Pick<PrivacySettings, 'show_followers_following'>>) => {
      if (!lowerAddress) throw new Error('Not authenticated');

      // Check if settings exist
      const checkQuery = supabase
        .from('user_privacy_settings')
        .select('id')
        .eq('wallet_address', lowerAddress)
        .maybeSingle();

      const { data: existing } = await withWalletHeader(checkQuery, lowerAddress);

      if (existing) {
        // Update existing
        const updateQuery = supabase
          .from('user_privacy_settings')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('wallet_address', lowerAddress);

        const { error } = await withWalletHeader(updateQuery, lowerAddress);
        if (error) throw error;
      } else {
        // Insert new
        const insertQuery = supabase
          .from('user_privacy_settings')
          .insert({
            wallet_address: lowerAddress,
            ...updates,
          });

        const { error } = await withWalletHeader(insertQuery, lowerAddress);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-settings', lowerAddress] });
      toast.success('Privacy settings updated');
    },
    onError: (error) => {
      console.error('Failed to update privacy settings:', error);
      toast.error('Failed to update settings');
    },
  });

  return {
    settings,
    isLoading,
    showFollowersFollowing: settings?.show_followers_following ?? true, // Default to true
    updateSettings: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}

/**
 * Hook to check another user's privacy settings (for profile pages)
 */
export function useUserPrivacySettings(walletAddress?: string) {
  const lowerAddress = walletAddress?.toLowerCase();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['privacy-settings', lowerAddress],
    queryFn: async (): Promise<PrivacySettings | null> => {
      if (!lowerAddress) return null;

      const { data, error } = await supabase
        .from('user_privacy_settings')
        .select('*')
        .eq('wallet_address', lowerAddress)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch user privacy settings:', error);
        return null;
      }

      return data as PrivacySettings | null;
    },
    enabled: !!lowerAddress,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    settings,
    isLoading,
    showFollowersFollowing: settings?.show_followers_following ?? true, // Default to true if not set
  };
}
