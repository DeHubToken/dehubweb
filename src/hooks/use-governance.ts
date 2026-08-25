/**
 * Governance Hook
 * ===============
 * Data fetching and mutations for the governance proposal board. Reads come
 * straight from Supabase; writes do not.
 *
 * Votes and proposals used to be written directly to PostgREST, with the
 * vote's badge weight computed here and sent up as a number. The table's RLS
 * authenticated those writes against the caller's own `x-wallet-address`
 * header, so both the voter and the weight were whatever the request said they
 * were. Both now go through edge functions that resolve the wallet from a
 * verified DeHub token and derive the weight server-side from the badge
 * balance the API holds. What `getVoteWeight` returns here is a preview of
 * that answer, for the panel that tells someone what their vote is worth.
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getBadgeName, BADGE_LEVELS, type BadgeContext } from '@/lib/staking-badges';
import { useSelfBadge, preferLiveBalance } from '@/hooks/use-self-badge-balance';
import { useBadgeScale } from '@/hooks/use-badge-scale';
import { dehubAuthHeaders } from '@/lib/ai-invoke';
import { escapeFilterValue } from '@/lib/postgrest-filter';
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
  /** When voting closes. Null on the rows that predate the seven-day window. */
  voting_ends_at: string | null;
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

/**
 * The weight a badge balance votes with.
 *
 * `context` carries the ladder scale and the holder's grandfathered tier, and
 * both matter here: without the lock this returns the tier the live ladder
 * gives them, which can be lower than the badge they are shown everywhere else
 * on the site. The server resolves the same three inputs, so passing them
 * keeps the number on screen equal to the number that gets recorded.
 */
export function getVoteWeight(
  badgeBalance: number | undefined | null,
  username?: string | null,
  context?: BadgeContext,
): { weight: number; badgeName: string | null } {
  const badgeName = getBadgeName(badgeBalance, username, context);
  if (!badgeName) return { weight: 0, badgeName: null };
  return { weight: BADGE_VOTE_WEIGHT[badgeName] || 1, badgeName };
}

/**
 * The signed-in user's own vote weight, resolved the way the server will.
 *
 * The account row's `badgeBalance` lags the chain, so a fresh buyer would be
 * told they cannot vote while the badge next to their name says otherwise;
 * `preferLiveBalance` promotes them the moment the tokens land, and the lock
 * and scale come from the same place every other badge on the page reads.
 */
export function useSelfVoteWeight(): { weight: number; badgeName: string | null } {
  const { user } = useAuth();
  const self = useSelfBadge();
  const scale = useBadgeScale();
  const balance = preferLiveBalance(user?.badgeBalance as number | undefined, self.balance);
  return getVoteWeight(balance, user?.username, { scale, lock: self.lock });
}

export { BADGE_VOTE_WEIGHT };

const PAGE_SIZE = 15;

/**
 * Call a governance edge function and surface the reason it refused.
 *
 * On a non-2xx, supabase-js nulls `data` and throws a FunctionsHttpError whose
 * message is the literal "Edge Function returned a non-2xx status code" — the
 * server's message is on `error.context`, an unread Response. Every refusal
 * here is one a voter needs to read ("voting has closed", "you need a badge"),
 * so it is worth unwrapping rather than showing that string.
 */
async function callGovernance<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: dehubAuthHeaders(),
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    let detail: string | undefined;
    if (context) {
      try {
        detail = (await context.json())?.error;
      } catch {
        // Body was not JSON — fall through to the generic message.
      }
    }
    throw new Error(detail || error.message || 'Request failed');
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export function useGovernanceProposals(sort: GovernanceSort, search: string) {
  return useInfiniteQuery({
    queryKey: ['governance-proposals', sort, search],
    queryFn: async ({ pageParam = 0 }) => {
      // Only proposals still open to a vote. `neq('completed')` used to leave
      // passed/rejected ones here too, so a decided proposal showed in both
      // this tab and its verdict tab.
      let query = supabase
        .from('governance_proposals')
        .select('*')
        .eq('status', 'open');

      if (search.trim()) {
        const pattern = escapeFilterValue(`%${search.trim()}%`);
        query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`);
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
  const { walletAddress } = useAuth();

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

      const receipt = await txResult.wait(1);
      toast.dismiss('governance-proposal-fee');

      // ── Record proposal, once the chain agrees the fee was paid ──
      // The row is written by the edge function, not from here: the insert
      // this replaced had no idea a fee existed, so posting straight to
      // PostgREST created a free proposal.
      const result = await callGovernance<{ proposal: GovernanceProposal }>('governance-proposal', {
        title: title.trim(),
        description: description.trim(),
        txHash: receipt?.hash || txResult.hash,
      });
      return result.proposal;
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
    mutationFn: async ({ proposalId, voteType, voteWeight }: {
      proposalId: string;
      voteType: 1 | -1;
      currentVote: number | undefined;
      voteWeight: number;
      badgeName: string | null;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      if (voteWeight === 0) throw new Error('You must hold tokens to vote');

      // Three things are deliberately not sent: the weight, the badge name and
      // whether this click is a withdrawal. The function reads the badge
      // balance for the wallet its token belongs to and decides the first two;
      // it compares against the stored vote to decide the third. Deciding the
      // toggle here meant reading `currentVote`, which is a render old — the
      // old code read it from the props in the mutation and from the cache in
      // the optimistic update, so the two could disagree and a withdrawal
      // would land as a re-vote. `voteWeight` stays in the arguments only
      // because the optimistic update needs a number to move the bar by.
      return callGovernance<{ action: 'voted' | 'removed'; weight: number; badgeName: string | null }>(
        'governance-vote',
        { proposalId, voteType },
      );
    },
    onMutate: async ({ proposalId, voteType, voteWeight }) => {
      await queryClient.cancelQueries({ queryKey: ['governance-proposals'] });
      await queryClient.cancelQueries({ queryKey: ['governance-votes'] });
      await queryClient.cancelQueries({ queryKey: ['governance-proposal'] });

      const previousRequests = queryClient.getQueriesData({ queryKey: ['governance-proposals'] });
      const previousVotes = queryClient.getQueryData(['governance-votes', walletAddress]);
      const previousDetail = queryClient.getQueryData(['governance-proposal', proposalId]);

      // Read ACTUAL current vote from cache (not the stale prop)
      const cachedVotes = previousVotes as Record<string, { type: number; weight: number }> | undefined;
      const actualCurrentVote = cachedVotes?.[proposalId]?.type;
      const oldWeight = cachedVotes?.[proposalId]?.weight ?? voteWeight;

      // Optimistic vote map update
      queryClient.setQueryData(['governance-votes', walletAddress], (old: Record<string, { type: number; weight: number }> | undefined) => {
        const newVotes = { ...(old || {}) };
        if (actualCurrentVote === voteType) {
          delete newVotes[proposalId];
        } else {
          newVotes[proposalId] = { type: voteType, weight: voteWeight };
        }
        return newVotes;
      });

      // Compute deltas once
      let likeDelta = 0;
      let dislikeDelta = 0;
      if (actualCurrentVote === voteType) {
        // Removing vote — use old weight
        if (voteType === 1) likeDelta = -oldWeight;
        else dislikeDelta = -oldWeight;
      } else if (actualCurrentVote) {
        // Changing vote — remove old weight, add new weight
        if (actualCurrentVote === 1) { likeDelta = -oldWeight; dislikeDelta = voteWeight; }
        else { dislikeDelta = -oldWeight; likeDelta = voteWeight; }
      } else {
        // New vote
        if (voteType === 1) likeDelta = voteWeight;
        else dislikeDelta = voteWeight;
      }

      // Optimistic vote count update on list pages (weighted)
      queryClient.setQueriesData({ queryKey: ['governance-proposals'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: GovernanceProposal[]) =>
            page.map((p) => {
              if (p.id !== proposalId) return p;
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

      // Optimistic update on detail page query
      queryClient.setQueryData(['governance-proposal', proposalId], (old: GovernanceProposal | undefined) => {
        if (!old) return old;
        return {
          ...old,
          vote_count: old.vote_count + likeDelta - dislikeDelta,
          like_count: (old.like_count ?? 0) + likeDelta,
          dislike_count: (old.dislike_count ?? 0) + dislikeDelta,
        };
      });

      return { previousRequests, previousVotes, previousDetail, proposalId };
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
      if (context?.previousDetail && context?.proposalId) {
        queryClient.setQueryData(['governance-proposal', context.proposalId], context.previousDetail);
      }
      const msg = parseTxError(err) || err?.message || 'Vote failed. You must hold DHB tokens to vote.';
      toast.error(msg);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['governance-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['governance-proposal'] });
      queryClient.invalidateQueries({ queryKey: ['governance-votes'] });
    },
  });
}
