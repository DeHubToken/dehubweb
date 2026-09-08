import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { dehubAuthHeaders } from '@/lib/ai-invoke';

export type DaoProposalKind = 'spend' | 'buy';
export type DaoProposalStatus =
  | 'open'
  | 'accepted'
  | 'rejected'
  | 'payment_submitted'
  | 'completed'
  | 'expired'
  | 'cancelled';

export interface DaoProposal {
  id: string;
  proposer_address: string;
  proposer_username: string | null;
  proposer_avatar: string | null;
  kind: DaoProposalKind;
  title: string;
  description: string;
  dhb_amount: number | null;
  price_usd: number | null;
  total_usd: number | null;
  spend_asset: string | null;
  spend_amount: number | null;
  recipient_address: string | null;
  status: DaoProposalStatus;
  electorate_dhb: number;
  accept_dhb: number;
  reject_dhb: number;
  voting_ends_at: string;
  accepted_at: string | null;
  payment_due_at: string | null;
  payment_chain_id: number | null;
  payment_asset: string | null;
  payment_amount: number | null;
  payment_tx_hash: string | null;
  payment_submitted_at: string | null;
  payment_verified_at: string | null;
  fulfilment_tx_hash: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDaoProposalInput {
  kind: DaoProposalKind;
  title: string;
  description: string;
  dhbAmount?: number;
  priceUsd?: number;
  spendAsset?: string;
  spendAmount?: number;
  recipientAddress?: string;
}

export interface DaoPaymentProof {
  proposalId: string;
  chainId: number;
  asset: string;
  amount: number;
  txHash: string;
}

const db = supabase as unknown as SupabaseClient;
const DAO_PROPOSALS_KEY = ['dao-proposals'] as const;

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseProposal(row: Record<string, unknown>): DaoProposal {
  return {
    ...(row as unknown as DaoProposal),
    dhb_amount: row.dhb_amount == null ? null : numeric(row.dhb_amount),
    price_usd: row.price_usd == null ? null : numeric(row.price_usd),
    total_usd: row.total_usd == null ? null : numeric(row.total_usd),
    spend_amount: row.spend_amount == null ? null : numeric(row.spend_amount),
    electorate_dhb: numeric(row.electorate_dhb),
    accept_dhb: numeric(row.accept_dhb),
    reject_dhb: numeric(row.reject_dhb),
    payment_amount: row.payment_amount == null ? null : numeric(row.payment_amount),
  };
}

async function callDao<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('dao-proposals', {
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
        // Use the SDK error below when an upstream response is not JSON.
      }
    }
    throw new Error(detail || error.message || 'DAO request failed');
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export function effectiveDaoProposalStatus(proposal: DaoProposal, now = Date.now()): DaoProposalStatus {
  if (proposal.status !== 'open' && proposal.status !== 'accepted') return proposal.status;
  if (proposal.status === 'accepted') {
    if (proposal.kind === 'buy' && !proposal.payment_tx_hash && proposal.payment_due_at && Date.parse(proposal.payment_due_at) <= now) {
      return 'expired';
    }
    return 'accepted';
  }
  if (Date.parse(proposal.voting_ends_at) > now) return 'open';
  const participation = proposal.accept_dhb + proposal.reject_dhb;
  return proposal.accept_dhb > proposal.reject_dhb && participation >= proposal.electorate_dhb * 0.1
    ? 'accepted'
    : 'rejected';
}

export function useDaoProposals() {
  const queryClient = useQueryClient();
  const { walletAddress, isAuthenticated } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;

  const proposals = useQuery({
    queryKey: DAO_PROPOSALS_KEY,
    queryFn: async () => {
      const { data, error } = await db
        .from('dao_proposals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(normaliseProposal);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const myVotes = useQuery({
    queryKey: ['dao-proposal-votes', wallet],
    queryFn: async () => {
      const { data, error } = await db
        .from('dao_proposal_votes')
        .select('proposal_id,vote_type,vote_weight')
        .eq('wallet_address', wallet!);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row: Record<string, unknown>) => [
        String(row.proposal_id),
        { type: Number(row.vote_type) as 1 | -1, weight: numeric(row.vote_weight) },
      ]));
    },
    enabled: isAuthenticated && !!wallet,
    staleTime: 15_000,
  });

  const myEligibility = useQuery({
    queryKey: ['dao-proposal-eligibility', wallet],
    queryFn: async () => {
      const { data, error } = await db
        .from('dao_proposal_voters')
        .select('proposal_id,vote_weight')
        .eq('wallet_address', wallet!);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row: Record<string, unknown>) => [
        String(row.proposal_id),
        numeric(row.vote_weight),
      ]));
    },
    enabled: isAuthenticated && !!wallet,
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('dao-proposals-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dao_proposals' }, () => {
        queryClient.invalidateQueries({ queryKey: DAO_PROPOSALS_KEY });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dao_proposal_votes' }, () => {
        queryClient.invalidateQueries({ queryKey: DAO_PROPOSALS_KEY });
        queryClient.invalidateQueries({ queryKey: ['dao-proposal-votes'] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);

  return {
    ...proposals,
    proposals: proposals.data ?? [],
    myVotes: myVotes.data ?? {},
    myEligibility: myEligibility.data ?? {},
  };
}

export function useCreateDaoProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDaoProposalInput) =>
      callDao<{ proposal: DaoProposal }>({ action: 'create', ...input }).then((result) => result.proposal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DAO_PROPOSALS_KEY }),
  });
}

export function useVoteDaoProposal() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  return useMutation({
    mutationFn: ({ proposalId, voteType }: { proposalId: string; voteType: 1 | -1 | 0 }) =>
      callDao<{ action: 'voted' | 'removed'; weight: number }>({ action: 'vote', proposalId, voteType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DAO_PROPOSALS_KEY });
      queryClient.invalidateQueries({ queryKey: ['dao-proposal-votes', walletAddress?.toLowerCase() ?? null] });
    },
  });
}

export function useSubmitDaoPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proof: DaoPaymentProof) =>
      callDao<{ proposal: DaoProposal }>({ action: 'submit_payment', ...proof }).then((result) => result.proposal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DAO_PROPOSALS_KEY }),
  });
}
