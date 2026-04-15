/**
 * Communities Hooks
 * =================
 * React Query hooks for community CRUD, membership, and pinned communities.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  creator_wallet_address: string;
  is_private: boolean;
  member_count: number;
  rules: any[];
  ticker_symbol: string | null;
  ticker_contract_address: string | null;
  ticker_chain_id: string | null;
  ticker_pair_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  wallet_address: string;
  role: string;
  status: string;
  joined_at: string;
}

export interface PinnedCommunity {
  id: string;
  wallet_address: string;
  community_id: string;
  display_order: number;
  created_at: string;
  communities?: Community;
}

// ─── Fetch all communities (discover) ─────────────────────────────────────────

export function useDiscoverCommunities() {
  return useQuery({
    queryKey: ['communities', 'discover'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .order('member_count', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Community[];
    },
    staleTime: 60_000,
  });
}

// ─── Fetch user's joined communities ──────────────────────────────────────────

export function useUserCommunities() {
  const { walletAddress } = useAuth();

  return useQuery({
    queryKey: ['communities', 'user', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const { data, error } = await withWalletHeader(
        supabase
          .from('community_members')
          .select('*, communities(*)')
          .eq('status', 'active')
          .ilike('wallet_address', walletAddress),
        walletAddress
      );
      if (error) throw error;
      return (data ?? []) as (CommunityMember & { communities: Community })[];
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });
}

// ─── Fetch single community by slug ───────────────────────────────────────────

export function useCommunity(slug: string | undefined) {
  return useQuery({
    queryKey: ['communities', 'slug', slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data as Community;
    },
    enabled: !!slug,
  });
}

// ─── Fetch members of a community ────────────────────────────────────────────

export function useCommunityMembers(communityId: string | undefined) {
  return useQuery({
    queryKey: ['communities', 'members', communityId],
    queryFn: async () => {
      if (!communityId) return [];
      const { data, error } = await supabase
        .from('community_members')
        .select('*')
        .eq('community_id', communityId)
        .eq('status', 'active')
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommunityMember[];
    },
    enabled: !!communityId,
  });
}

// ─── Fetch pending members of a community ────────────────────────────────────

export function usePendingCommunityMembers(communityId: string | undefined) {
  return useQuery({
    queryKey: ['communities', 'pending-members', communityId],
    queryFn: async () => {
      if (!communityId) return [];
      const { data, error } = await supabase
        .from('community_members')
        .select('*')
        .eq('community_id', communityId)
        .eq('status', 'pending')
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommunityMember[];
    },
    enabled: !!communityId,
  });
}

// ─── Approve / reject pending member ─────────────────────────────────────────

export function useApproveMember() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, communityId }: { memberId: string; communityId: string }) => {
      if (!walletAddress) throw new Error('Not connected');
      const { error } = await withWalletHeader(
        supabase
          .from('community_members')
          .update({ status: 'active' })
          .eq('id', memberId),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      toast.success('Member approved');
    },
    onError: () => toast.error('Failed to approve'),
  });
}

export function useRejectMember() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, communityId }: { memberId: string; communityId: string }) => {
      if (!walletAddress) throw new Error('Not connected');
      const { error } = await withWalletHeader(
        supabase
          .from('community_members')
          .delete()
          .eq('id', memberId),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      toast.success('Request rejected');
    },
    onError: () => toast.error('Failed to reject'),
  });
}

// ─── Check if user is member ─────────────────────────────────────────────────

export function useIsCommunityMember(communityId: string | undefined) {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['communities', 'membership', communityId, walletAddress],
    queryFn: async () => {
      if (!communityId || !walletAddress) return null;
      const { data, error } = await supabase
        .from('community_members')
        .select('*')
        .eq('community_id', communityId)
        .ilike('wallet_address', walletAddress)
        .maybeSingle();
      if (error) throw error;
      return data as CommunityMember | null;
    },
    enabled: !!communityId && !!walletAddress,
  });
}

// ─── Create community ────────────────────────────────────────────────────────

export function useCreateCommunity() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; slug: string; description?: string; avatar_url?: string; banner_url?: string; is_private?: boolean; rules?: any[] }) => {
      if (!walletAddress) throw new Error('Not connected');
      const { data, error } = await withWalletHeader(
        supabase
          .from('communities')
          .insert({
            name: input.name,
            slug: input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            description: input.description || null,
            avatar_url: input.avatar_url || null,
            banner_url: input.banner_url || null,
            creator_wallet_address: walletAddress,
            is_private: input.is_private || false,
            rules: input.rules || [],
          })
          .select()
          .single(),
        walletAddress
      );
      if (error) throw error;
      return data as Community;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      toast.success('Community created!');
    },
    onError: (e: any) => {
      if (e?.message?.includes('duplicate')) {
        toast.error('That slug is already taken');
      } else {
        toast.error('Failed to create community');
      }
    },
  });
}

// ─── Update community ────────────────────────────────────────────────────────

export function useUpdateCommunity() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Community> & { id: string }) => {
      if (!walletAddress) throw new Error('Not connected');
      const { data, error } = await withWalletHeader(
        supabase
          .from('communities')
          .update(updates)
          .eq('id', id)
          .select()
          .single(),
        walletAddress
      );
      if (error) throw error;
      return data as Community;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      toast.success('Community updated');
    },
    onError: () => toast.error('Failed to update community'),
  });
}

// ─── Join community ──────────────────────────────────────────────────────────

export function useJoinCommunity() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ communityId, isPrivate }: { communityId: string; isPrivate?: boolean }) => {
      if (!walletAddress) throw new Error('Not connected');
      const { error } = await withWalletHeader(
        supabase
          .from('community_members')
          .insert({
            community_id: communityId,
            wallet_address: walletAddress,
            role: 'member',
            status: isPrivate ? 'pending' : 'active',
          }),
        walletAddress
      );
      if (error) throw error;
      return { isPrivate };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      toast.success(result?.isPrivate ? 'Join request sent!' : 'Joined community!');
    },
    onError: () => toast.error('Failed to join'),
  });
}

// ─── Leave community ────────────────────────────────────────────────────────

export function useLeaveCommunity() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (communityId: string) => {
      if (!walletAddress) throw new Error('Not connected');
      const { error } = await withWalletHeader(
        supabase
          .from('community_members')
          .delete()
          .eq('community_id', communityId)
          .ilike('wallet_address', walletAddress),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: (_data, _vars, _ctx) => {
      qc.invalidateQueries({ queryKey: ['communities'] });
    },
    onError: () => toast.error('Failed to leave'),
  });
}

// ─── Pinned communities ─────────────────────────────────────────────────────

export function usePinnedCommunities(walletAddress: string | null | undefined) {
  return useQuery({
    queryKey: ['communities', 'pinned', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const { data, error } = await supabase
        .from('pinned_communities')
        .select('*, communities(*)')
        .ilike('wallet_address', walletAddress)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PinnedCommunity[];
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });
}

export function usePinCommunity() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ communityId, displayOrder }: { communityId: string; displayOrder: number }) => {
      if (!walletAddress) throw new Error('Not connected');
      const { error } = await withWalletHeader(
        supabase
          .from('pinned_communities')
          .insert({
            wallet_address: walletAddress,
            community_id: communityId,
            display_order: displayOrder,
          }),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communities', 'pinned'] });
      toast.success('Community pinned to profile');
    },
    onError: () => toast.error('Failed to pin community'),
  });
}

export function useUnpinCommunity() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (communityId: string) => {
      if (!walletAddress) throw new Error('Not connected');
      const { error } = await withWalletHeader(
        supabase
          .from('pinned_communities')
          .delete()
          .eq('community_id', communityId)
          .ilike('wallet_address', walletAddress),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communities', 'pinned'] });
      toast.success('Community unpinned');
    },
    onError: () => toast.error('Failed to unpin'),
  });
}

// ─── Upload community media ─────────────────────────────────────────────────

export async function uploadCommunityMedia(file: File, slug: string, type: 'avatar' | 'banner'): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  // Use a unique path each time to bust CDN/browser cache
  const path = `${slug}/${type}_${Date.now()}.${ext}`;
  
  const { error } = await supabase.storage
    .from('community-media')
    .upload(path, file, { upsert: true });
  if (error) throw error;

  const { data } = supabase.storage
    .from('community-media')
    .getPublicUrl(path);
  
  return data.publicUrl;
}
