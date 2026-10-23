import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getProposalRepostState, toggleProposalRepost } from '@/lib/api/dehub';
import type { GovernanceProposal } from './use-governance';

/**
 * Repost state for a governance proposal, and the toggle the share sheet's
 * Repost / Undo repost call. ActionBar does the optimistic count and icon; the
 * toggle rejects on failure so it can roll them back.
 */
export function useProposalRepost(proposal: GovernanceProposal | null | undefined, walletAddress?: string | null) {
  const queryClient = useQueryClient();
  const proposalId = proposal?.id;
  const key = ['proposal-repost', proposalId, walletAddress?.toLowerCase() ?? null];

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getProposalRepostState(proposalId!),
    enabled: !!proposalId,
    staleTime: 30_000,
    retry: false,
  });

  const toggle = useCallback(async () => {
    if (!proposal) return;
    const res = await toggleProposalRepost(proposal.id, {
      title: proposal.title,
      author: proposal.author_wallet_address,
    });
    queryClient.setQueryData(key, { count: Number(res?.repostCount) || 0, reposted: !!res?.reposted });
    if (walletAddress) queryClient.invalidateQueries({ queryKey: ['user-proposal-reposts', walletAddress.toLowerCase()] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, queryClient, walletAddress, proposalId]);

  return { count: data?.count ?? 0, reposted: data?.reposted ?? false, toggle };
}
