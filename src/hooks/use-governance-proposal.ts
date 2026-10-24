import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GovernanceProposal } from './use-governance';

const isProposalNumber = (key: string | undefined): key is string => !!key && /^\d{1,9}$/.test(key);

/**
 * One proposal by its uuid or its public number (`/app/governance/2`). Every
 * cache — votes, discussion, optimistic tallies — is keyed by the uuid, so a
 * number is resolved to the row first and the row is seeded under its uuid;
 * the detail query below then reads that seed.
 */
export function useGovernanceProposal(key: string | undefined) {
  const queryClient = useQueryClient();
  const byNumber = isProposalNumber(key);
  const resolved = useQuery({
    queryKey: ['governance-proposal-number', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('governance_proposals')
        .select('*')
        .eq('proposal_number', Number(key))
        .single();
      if (error) throw error;
      const row = data as GovernanceProposal;
      queryClient.setQueryData(['governance-proposal', row.id], row);
      return row.id;
    },
    enabled: byNumber,
    staleTime: Infinity,
    placeholderData: () => findCachedProposal(queryClient, (p) => p.proposal_number === Number(key))?.id,
  });
  const proposalId = byNumber ? resolved.data : key;
  const detail = useGovernanceProposalById(proposalId);
  return byNumber && !proposalId
    ? { ...detail, isLoading: resolved.isLoading, isError: resolved.isError, error: resolved.error }
    : detail;
}

function useGovernanceProposalById(proposalId: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['governance-proposal', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('governance_proposals')
        .select('*')
        .eq('id', proposalId!)
        .single();
      if (error) throw error;
      return data as GovernanceProposal;
    },
    enabled: !!proposalId,
    staleTime: 60_000,
    placeholderData: () => findCachedProposal(queryClient, (p) => p.id === proposalId),
  });
}

/**
 * Instant open from the board: the list caches hold full `select('*')` rows,
 * so paint the clicked proposal immediately while the fetch runs behind it.
 * Covers the detail cache, the active-proposals infinite query (paged arrays)
 * and the completed-proposals flat list.
 */
function findCachedProposal(
  queryClient: ReturnType<typeof useQueryClient>,
  match: (p: GovernanceProposal) => boolean,
): GovernanceProposal | undefined {
  const caches = [
    ...queryClient.getQueryCache().findAll({ queryKey: ['governance-proposal'] }),
    ...queryClient.getQueryCache().findAll({ queryKey: ['governance-proposals'] }),
    ...queryClient.getQueryCache().findAll({ queryKey: ['governance-proposals-completed'] }),
  ];
  for (const query of caches) {
    const data = query.state.data as
      | { pages?: GovernanceProposal[][] }
      | GovernanceProposal[]
      | GovernanceProposal
      | undefined;
    const rows = Array.isArray(data)
      ? data
      : data && 'pages' in data
        ? data.pages?.flat()
        : data ? [data as GovernanceProposal] : [];
    const hit = rows?.find?.((p) => p && match(p));
    if (hit) return hit;
  }
  return undefined;
}
