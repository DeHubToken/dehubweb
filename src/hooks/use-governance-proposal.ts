import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GovernanceProposal } from './use-governance';

export function useGovernanceProposal(proposalId: string | undefined) {
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
    // Instant open from the board: the list caches hold full `select('*')`
    // rows, so paint the clicked proposal immediately while the fetch runs
    // behind it. Covers the active-proposals infinite query (paged arrays)
    // and the completed-proposals flat list.
    placeholderData: () => {
      const caches = [
        ...queryClient.getQueryCache().findAll({ queryKey: ['governance-proposals'] }),
        ...queryClient.getQueryCache().findAll({ queryKey: ['governance-proposals-completed'] }),
      ];
      for (const query of caches) {
        const data = query.state.data as
          | { pages?: GovernanceProposal[][] }
          | GovernanceProposal[]
          | undefined;
        const rows = Array.isArray(data) ? data : data?.pages?.flat();
        const hit = rows?.find?.(p => p?.id === proposalId);
        if (hit) return hit;
      }
      return undefined;
    },
  });
}
