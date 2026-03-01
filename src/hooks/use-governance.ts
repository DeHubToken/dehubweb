/**
 * Governance Hook
 * ===============
 * Data fetching and mutations for the governance proposal board.
 * Uses Supabase directly with weighted voting based on badge tier.
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getBadgeName, BADGE_LEVELS } from '@/lib/staking-badges';
import { Interface } from 'ethers';
import {
  writeContractAA,
  getWalletAddress,
  getERC20Balance,
  switchChain,
  parseTxError,
} from '@/lib/contracts/aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';

const GOVERNANCE_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';

const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

export type GovernanceSort = 'most_voted' | 'newest';
export type GovernanceStatus = 'open' | 'completed' | 'passed' | 'rejected';

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  status: GovernanceStatus;
  author_wallet_address: string;
  author_username: string | null;
  author_avatar: string | null;
  vote_count: number;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Badge tier → vote weight mapping.
 * Crab (10k) = 1, up to Megalodon (50M) = 13.
 */
const BADGE_VOTE_WEIGHT: Record<string, number> = {
  "Crab": 1,
  "Lobster": 2,
  "Piranha": 3,
  "Tortoise": 4,
  "Cobra": 5,
  "Octopus": 6,
  "Crocodite": 7,
  "Dolphin": 8,
  "Tiger Shark": 9,
  "Killer Whale": 10,
  "Great White Shark": 11,
  "Blue Whale": 12,
  "Meglodon": 13,
};

export function getVoteWeight(badgeBalance: number | undefined | null, username?: string | null): { weight: number; badgeName: string | null } {
  const badgeName = getBadgeName(badgeBalance, username);
  if (!badgeName) return { weight: 0, badgeName: null };
  return { weight: BADGE_VOTE_WEIGHT[badgeName] || 1, badgeName };
}

export { BADGE_VOTE_WEIGHT };

const PAGE_SIZE = 15;

export function useGovernanceProposals(sort: GovernanceSort, search: string) {
  return useInfiniteQuery({
    queryKey: ['governance-proposals', sort, search],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('governance_proposals')
        .select('*')
        .neq('status', 'completed');

      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
      }

      switch (sort) {
        case 'most_voted':
          query = query.order('vote_count', { ascending: false }).order('created_at', { ascending: false });
          break;
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
      }

      query = query.range(pageParam, pageParam + PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as GovernanceProposal[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useCompletedProposals() {
  return useQuery({
    queryKey: ['governance-proposals-completed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('governance_proposals')
        .select('*')
        .in('status', ['completed', 'passed', 'rejected'])
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as GovernanceProposal[];
    },
    staleTime: 60_000,
  });
}

export function useTotalGovernanceCount() {
  return useQuery({
    queryKey: ['governance-proposals-total-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('governance_proposals')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
}

export function useGovernanceUserVotes() {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['governance-votes', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return {};
      const { data, error } = await supabase
        .from('governance_votes')
        .select('proposal_id, vote_type, vote_weight')
        .eq('wallet_address', walletAddress.toLowerCase());
      if (error) throw error;
      const voteMap: Record<string, { type: number; weight: number }> = {};
      for (const vote of data || []) {
        voteMap[vote.proposal_id] = { type: vote.vote_type, weight: vote.vote_weight };
      }
      return voteMap;
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });
}

const GOVERNANCE_PROPOSAL_FEE = 10000; // DHB per proposal

export function useSubmitGovernanceProposal() {
  const queryClient = useQueryClient();
  const { walletAddress, user } = useAuth();

  return useMutation({
    mutationFn: async ({ title, description }: { title: string; description: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      // ── Charge 10,000 DHB proposal fee ─────────────────────
      const chainConfig = getChainConfig(BASE_CHAIN_ID);
      await switchChain(BASE_CHAIN_ID);
      const signerAddress = await getWalletAddress();
      const amountWei = toWei(GOVERNANCE_PROPOSAL_FEE, DHB_TOKEN.decimals);
      const balance = await getERC20Balance(chainConfig.dhbToken, signerAddress, BASE_CHAIN_ID);

      if (balance < amountWei) {
        const balanceHuman = Number(balance) / 1e18;
        throw new Error(
          `Insufficient unstaked DHB on Base. Need ${GOVERNANCE_PROPOSAL_FEE.toLocaleString()} liquid (unstaked) DHB on Base but have ${balanceHuman.toFixed(2)} DHB. Staked DHB cannot be used for fees.`
        );
      }

      toast.loading('Processing proposal fee...', { id: 'governance-proposal-fee' });

      const txResult = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [GOVERNANCE_TREASURY, amountWei],
        { context: 'Governance proposal fee', chainId: BASE_CHAIN_ID }
      );

      await txResult.wait(1);
      toast.dismiss('governance-proposal-fee');

      // ── Record proposal in DB ──────────────────────────────
      const { data, error } = await supabase
        .from('governance_proposals')
        .insert({
          title: title.trim(),
          description: description.trim(),
          author_wallet_address: walletAddress.toLowerCase(),
          author_username: user?.username || null,
          author_avatar: user?.avatarImageUrl || null,
        })
        .select()
        .single()
        .setHeader('x-wallet-address', walletAddress.toLowerCase());
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['governance-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['governance-proposals-total-count'] });
      toast.success('Governance proposal submitted!');
    },
    onError: (err: any) => {
      toast.dismiss('governance-proposal-fee');
      const msg = parseTxError(err) || err?.message || 'Failed to submit proposal';
      toast.error(msg);
    },
  });
}

export function useVoteGovernanceProposal() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({ proposalId, voteType, currentVote, voteWeight, badgeName }: {
      proposalId: string;
      voteType: 1 | -1;
      currentVote: number | undefined;
      voteWeight: number;
      badgeName: string | null;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      if (voteWeight === 0) throw new Error('You must hold tokens to vote');

      const wallet = walletAddress.toLowerCase();

      if (currentVote === voteType) {
        // Remove vote
        const { error } = await supabase
          .from('governance_votes')
          .delete()
          .eq('proposal_id', proposalId)
          .eq('wallet_address', wallet)
          .setHeader('x-wallet-address', wallet);
        if (error) throw error;
        return { action: 'removed' as const };
      } else {
        // ── Record vote in DB ──────────────────────────────────
        const { error } = await supabase
          .from('governance_votes')
          .upsert(
            {
              proposal_id: proposalId,
              wallet_address: wallet,
              vote_type: voteType,
              vote_weight: voteWeight,
              badge_name: badgeName,
            },
            { onConflict: 'proposal_id,wallet_address' }
          )
          .setHeader('x-wallet-address', wallet);
        if (error) throw error;
        return { action: 'voted' as const };
      }
    },
    onMutate: async ({ proposalId, voteType, currentVote, voteWeight }) => {
      await queryClient.cancelQueries({ queryKey: ['governance-proposals'] });
      await queryClient.cancelQueries({ queryKey: ['governance-votes'] });

      const previousRequests = queryClient.getQueriesData({ queryKey: ['governance-proposals'] });
      const previousVotes = queryClient.getQueryData(['governance-votes', walletAddress]);

      // Get old vote weight from cached data
      const oldVotes = previousVotes as Record<string, { type: number; weight: number }> | undefined;
      const oldWeight = oldVotes?.[proposalId]?.weight ?? voteWeight;

      // Optimistic vote map update
      queryClient.setQueryData(['governance-votes', walletAddress], (old: Record<string, { type: number; weight: number }> | undefined) => {
        const newVotes = { ...(old || {}) };
        if (currentVote === voteType) {
          delete newVotes[proposalId];
        } else {
          newVotes[proposalId] = { type: voteType, weight: voteWeight };
        }
        return newVotes;
      });

      // Optimistic vote count update (weighted)
      queryClient.setQueriesData({ queryKey: ['governance-proposals'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: GovernanceProposal[]) =>
            page.map((p) => {
              if (p.id !== proposalId) return p;
              let likeDelta = 0;
              let dislikeDelta = 0;

              if (currentVote === voteType) {
                // Removing vote — use old weight
                if (voteType === 1) likeDelta = -oldWeight;
                else dislikeDelta = -oldWeight;
              } else if (currentVote) {
                // Changing vote — remove old weight, add new weight
                if (currentVote === 1) { likeDelta = -oldWeight; dislikeDelta = voteWeight; }
                else { dislikeDelta = -oldWeight; likeDelta = voteWeight; }
              } else {
                // New vote
                if (voteType === 1) likeDelta = voteWeight;
                else dislikeDelta = voteWeight;
              }

              return {
                ...p,
                vote_count: p.vote_count + likeDelta - dislikeDelta,
                like_count: (p.like_count ?? 0) + likeDelta,
                dislike_count: (p.dislike_count ?? 0) + dislikeDelta,
              };
            })
          ),
        };
      });

      return { previousRequests, previousVotes };
    },
    onError: (err: any, _vars, context) => {
      toast.dismiss('governance-vote-fee');
      if (context?.previousRequests) {
        for (const [key, data] of context.previousRequests) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousVotes) {
        queryClient.setQueryData(['governance-votes', walletAddress], context.previousVotes);
      }
      const msg = parseTxError(err) || err?.message || 'Vote failed. You must hold DHB tokens to vote.';
      toast.error(msg);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['governance-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['governance-votes'] });
    },
  });
}
