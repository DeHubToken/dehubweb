import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GovernanceProposal } from './use-governance';

export function useGovernanceProposal(proposalId: string | undefined) {
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
  });
}
