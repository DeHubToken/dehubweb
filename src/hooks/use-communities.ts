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

// ─── Activity scores: recent chat message counts per community ────────────────

export function useCommunityActivityScores() {
  return useQuery({
    queryKey: ['communities', 'activity-scores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_chat_messages')
        .select('community_id')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: any) => {
        if (row.community_id) counts[row.community_id] = (counts[row.community_id] || 0) + 1;
      });
      return counts;
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
  const queryClient = useQueryClient();
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
    // Instant open from any list: discover holds full rows and the user's
    // joined list embeds them — paint the clicked community immediately
    // (which also unblocks the id-gated members/membership queries a full
    // round-trip earlier) while the authoritative fetch runs behind it.
    placeholderData: () => {
      if (!slug) return undefined;
      const discover = queryClient.getQueryData<Community[]>(['communities', 'discover']);
      const fromDiscover = discover?.find(c => c.slug === slug);
      if (fromDiscover) return fromDiscover;
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ['communities', 'user'] })) {
        const rows = query.state.data as Array<{ communities?: Community }> | undefined;
        const hit = rows?.find?.(m => m.communities?.slug === slug)?.communities;
        if (hit) return hit;
      }
      return undefined;
    },
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

// ─── Fetch banned members ────────────────────────────────────────────────────

export function useBannedCommunityMembers(communityId: string | undefined) {
  return useQuery({
    queryKey: ['communities', 'banned-members', communityId],
    queryFn: async () => {
      if (!communityId) return [];
      const { data, error } = await supabase
        .from('community_members')
        .select('*')
        .eq('community_id', communityId)
        .eq('status', 'banned')
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
    onSuccess: (_data, { communityId }) => {
      qc.invalidateQueries({ queryKey: ['communities', 'pending-members', communityId] });
      qc.invalidateQueries({ queryKey: ['communities', 'members', communityId] });
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
    onSuccess: (_data, { communityId }) => {
      qc.invalidateQueries({ queryKey: ['communities', 'pending-members', communityId] });
      toast.success('Request rejected');
    },
    onError: () => toast.error('Failed to reject'),
  });
}

// ─── Moderation: ban/unban/kick ──────────────────────────────────────────────

export function useBanMember() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId }: { memberId: string; communityId: string }) => {
      if (!walletAddress) throw new Error('Not connected');
      const { error } = await withWalletHeader(
        supabase.from('community_members').update({ status: 'banned' }).eq('id', memberId),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: (_data, { communityId }) => {
      qc.invalidateQueries({ queryKey: ['communities', 'members', communityId] });
      qc.invalidateQueries({ queryKey: ['communities', 'banned-members', communityId] });
      toast.success('Member banned from chat');
    },
    onError: () => toast.error('Failed to ban member'),
  });
}

export function useUnbanMember() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId }: { memberId: string; communityId: string }) => {
      if (!walletAddress) throw new Error('Not connected');
      const { error } = await withWalletHeader(
        supabase.from('community_members').update({ status: 'active' }).eq('id', memberId),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: (_data, { communityId }) => {
      qc.invalidateQueries({ queryKey: ['communities', 'banned-members', communityId] });
      qc.invalidateQueries({ queryKey: ['communities', 'members', communityId] });
      toast.success('Member unbanned');
    },
    onError: () => toast.error('Failed to unban member'),
  });
}

export function useKickMember() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId }: { memberId: string; communityId: string }) => {
      if (!walletAddress) throw new Error('Not connected');
      const { error } = await withWalletHeader(
        supabase.from('community_members').delete().eq('id', memberId),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: (_data, { communityId }) => {
      qc.invalidateQueries({ queryKey: ['communities', 'members', communityId] });
      qc.invalidateQueries({ queryKey: ['communities', 'pending-members', communityId] });
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
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
      qc.invalidateQueries({ queryKey: ['communities', 'discover'] });
      qc.invalidateQueries({ queryKey: ['communities', 'user'] });
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
      // Patch the detail cache directly with the fresh row, refresh only the discover list
      qc.setQueryData<Community>(['communities', 'slug', data.slug], data);
      qc.invalidateQueries({ queryKey: ['communities', 'discover'] });
      qc.invalidateQueries({ queryKey: ['community'] });
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
    onMutate: async ({ communityId, isPrivate }) => {
      if (!walletAddress) return undefined;
      await qc.cancelQueries({ queryKey: ['communities', 'membership', communityId] });

      const prevMembership = qc.getQueriesData<CommunityMember | null>({ queryKey: ['communities', 'membership', communityId] });
      const prevDiscover = qc.getQueryData<Community[]>(['communities', 'discover']);
      const prevSlug = qc.getQueriesData<Community | null>({ queryKey: ['communities', 'slug'] });

      // Flip the membership row that drives the Join/Leave button instantly
      qc.setQueriesData<CommunityMember | null>({ queryKey: ['communities', 'membership', communityId] }, () => ({
        id: `optimistic-${communityId}`,
        community_id: communityId,
        wallet_address: walletAddress,
        role: 'member',
        status: isPrivate ? 'pending' : 'active',
        joined_at: new Date().toISOString(),
      }));

      // Bump member counts in cached community objects (public joins only)
      if (!isPrivate) {
        const bump = (c: Community) => c.id === communityId ? { ...c, member_count: c.member_count + 1 } : c;
        qc.setQueryData<Community[]>(['communities', 'discover'], (old) => old?.map(bump));
        qc.setQueriesData<Community | null>({ queryKey: ['communities', 'slug'] }, (old) => (old ? bump(old) : old));
      }

      return { prevMembership, prevDiscover, prevSlug };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prevMembership?.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevDiscover) qc.setQueryData(['communities', 'discover'], ctx.prevDiscover);
      ctx?.prevSlug?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error('Failed to join');
    },
    onSuccess: (result, { communityId }) => {
      // Narrow refetches: real membership row (server id) + small per-community lists
      qc.invalidateQueries({ queryKey: ['communities', 'membership', communityId] });
      qc.invalidateQueries({ queryKey: ['communities', 'user'] });
      qc.invalidateQueries({ queryKey: ['communities', 'members', communityId] });
      // Counts were patched optimistically — mark stale without refetching
      qc.invalidateQueries({ queryKey: ['communities', 'discover'], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['communities', 'slug'], refetchType: 'none' });
      toast.success(result?.isPrivate ? 'Join request sent!' : 'Joined community!');
    },
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
    onMutate: async (communityId) => {
      await qc.cancelQueries({ queryKey: ['communities', 'membership', communityId] });

      const prevMembership = qc.getQueriesData<CommunityMember | null>({ queryKey: ['communities', 'membership', communityId] });
      const prevDiscover = qc.getQueryData<Community[]>(['communities', 'discover']);
      const prevSlug = qc.getQueriesData<Community | null>({ queryKey: ['communities', 'slug'] });
      const prevUser = qc.getQueriesData<(CommunityMember & { communities: Community })[]>({ queryKey: ['communities', 'user'] });
      const prevMembers = qc.getQueryData<CommunityMember[]>(['communities', 'members', communityId]);

      // Only an active member affects visible member counts (pending requests don't)
      const wasActive = prevMembership.some(([, m]) => m?.status === 'active');

      // Instantly clear the membership row that drives the Join/Leave button
      qc.setQueriesData<CommunityMember | null>({ queryKey: ['communities', 'membership', communityId] }, () => null);
      qc.setQueriesData<(CommunityMember & { communities: Community })[]>(
        { queryKey: ['communities', 'user'] },
        (old) => old?.filter(m => m.community_id !== communityId),
      );
      if (walletAddress) {
        qc.setQueryData<CommunityMember[]>(['communities', 'members', communityId], (old) =>
          old?.filter(m => m.wallet_address.toLowerCase() !== walletAddress.toLowerCase()));
      }
      if (wasActive) {
        const drop = (c: Community) => c.id === communityId ? { ...c, member_count: Math.max(0, c.member_count - 1) } : c;
        qc.setQueryData<Community[]>(['communities', 'discover'], (old) => old?.map(drop));
        qc.setQueriesData<Community | null>({ queryKey: ['communities', 'slug'] }, (old) => (old ? drop(old) : old));
      }

      return { prevMembership, prevDiscover, prevSlug, prevUser, prevMembers, communityId };
    },
    onError: (_err, communityId, ctx) => {
      ctx?.prevMembership?.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevDiscover) qc.setQueryData(['communities', 'discover'], ctx.prevDiscover);
      ctx?.prevSlug?.forEach(([key, data]) => qc.setQueryData(key, data));
      ctx?.prevUser?.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevMembers) qc.setQueryData(['communities', 'members', communityId], ctx.prevMembers);
      toast.error('Failed to leave');
    },
    onSuccess: (_data, communityId) => {
      // Caches already patched optimistically — mark the narrow keys stale without refetching
      qc.invalidateQueries({ queryKey: ['communities', 'membership', communityId], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['communities', 'user'], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['communities', 'members', communityId], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['communities', 'discover'], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['communities', 'slug'], refetchType: 'none' });
    },
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
