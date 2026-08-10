/**
 * Profile Preferences Hook
 * ========================
 * Reads and writes public.profile_preferences — the display choices a profile
 * makes that other people's screens have to honour, currently just the
 * temporary "New" badge opt-out.
 *
 * Absence of a row is the default (badge shown), so a viewer that cannot reach
 * the table degrades to the default experience rather than to a blank profile.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ProfilePreferences {
  hideNewMemberBadge: boolean;
}

const DEFAULTS: ProfilePreferences = { hideNewMemberBadge: false };

export const profilePreferenceKeys = {
  all: ['profile-preferences'] as const,
  one: (wallet?: string | null) =>
    [...profilePreferenceKeys.all, wallet?.toLowerCase() ?? null] as const,
};

interface PreferencesRow {
  wallet_address: string;
  hide_new_member_badge: boolean;
}

/**
 * profile_preferences postdates the generated Supabase types, so the table name
 * is not in the `from()` union yet. Declaring only the two calls this hook makes
 * keeps that gap in one place instead of casting at each call site — and once
 * the migration lands and types are regenerated, this can go away.
 */
type PreferencesQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<{ data: PreferencesRow | null; error: unknown }>;
    };
  };
  upsert: (row: Record<string, unknown>, options: { onConflict: string }) => UpsertBuilder;
};

/** setHeader returns the builder, which is what withWalletHeader's generic needs. */
type UpsertBuilder = PromiseLike<{ error: { message: string } | null }> & {
  setHeader: (key: string, value: string) => UpsertBuilder;
};

function preferencesTable(): PreferencesQuery {
  return (supabase as unknown as { from: (table: string) => PreferencesQuery })
    .from('profile_preferences');
}

/**
 * Preferences for any wallet. Readable by anyone — the policy is public SELECT,
 * because the viewer is the one who needs the answer.
 */
export function useProfilePreferences(walletAddress: string | null | undefined) {
  return useQuery({
    queryKey: profilePreferenceKeys.one(walletAddress),
    queryFn: async (): Promise<ProfilePreferences> => {
      if (!walletAddress) return DEFAULTS;

      const { data, error } = await preferencesTable()
        .select('wallet_address, hide_new_member_badge')
        .eq('wallet_address', walletAddress.toLowerCase())
        .maybeSingle();

      // A missing table (migration not applied yet) or an unreadable row both
      // mean "no opt-out recorded", which is the default rather than an error
      // worth showing on someone else's profile.
      if (error || !data) return DEFAULTS;

      return { hideNewMemberBadge: !!data.hide_new_member_badge };
    },
    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000,
  });
}

/** Writes the current user's own preferences. */
export function useUpdateProfilePreferences() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<ProfilePreferences>) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const row: Record<string, unknown> = { wallet_address: walletAddress.toLowerCase() };
      if (patch.hideNewMemberBadge !== undefined) {
        row.hide_new_member_badge = patch.hideNewMemberBadge;
      }

      const { error } = await withWalletHeader(
        preferencesTable().upsert(row, { onConflict: 'wallet_address' }),
        walletAddress,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profilePreferenceKeys.one(walletAddress) });
    },
    onError: () => toast.error('Failed to save preference'),
  });
}
