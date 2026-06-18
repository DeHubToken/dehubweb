/**
 * /work — Jobs marketplace hooks
 * Off-chain ledger + on-chain escrow via DeHubWork (best-effort; falls back
 * to off-chain when the contract address is the placeholder zero address).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  createJobOnChain,
  awardApplicantOnChain,
  approveSubmissionOnChain,
  openDisputeOnChain,
  adminResolveOnChain,
  isWorkContractDeployed,
} from '@/lib/contracts/dehub-work';
import type {
  WorkJob, WorkApplication, WorkSubmission, WorkReview,
  WorkJobType, WorkCurrency, WorkPlatform,
} from '../types';

const TBL_JOBS = 'work_jobs' as any;
const TBL_APPS = 'work_applications' as any;
const TBL_SUBS = 'work_submissions' as any;
const TBL_REVIEWS = 'work_reviews' as any;
const TBL_DISPUTES = 'work_disputes' as any;


// ── Browse jobs ──────────────────────────────────────────────
export function useBrowseJobs(filters?: {
  job_type?: WorkJobType | 'all';
  currency?: WorkCurrency | 'all';
  platform?: WorkPlatform | 'all';
  sort?: 'newest' | 'highest_pay' | 'ending_soon';
  search?: string;
}) {
  return useQuery({
    queryKey: ['work-jobs-browse', filters],
    queryFn: async () => {
      let q = supabase.from(TBL_JOBS).select('*').in('status', ['open', 'in_progress']);
      if (filters?.job_type && filters.job_type !== 'all') q = q.eq('job_type', filters.job_type);
      if (filters?.currency && filters.currency !== 'all') q = q.eq('currency', filters.currency);
      if (filters?.platform && filters.platform !== 'all') q = q.eq('platform', filters.platform);
      if (filters?.search) q = q.ilike('title', `%${filters.search}%`);

      if (filters?.sort === 'highest_pay') q = q.order('total_budget', { ascending: false });
      else if (filters?.sort === 'ending_soon') q = q.order('deadline', { ascending: true, nullsFirst: false });
      else q = q.order('created_at', { ascending: false });

      const { data, error } = await q.limit(100);
      if (error) throw error;
      return (data || []) as unknown as WorkJob[];
    },
    staleTime: 30_000,
  });
}

export function useWorkJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['work-job', jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from(TBL_JOBS).select('*').eq('id', jobId!).maybeSingle();
      if (error) throw error;
      return data as unknown as WorkJob | null;
    },
    enabled: !!jobId,
  });
}

export function useMyPostedJobs() {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['work-my-posted', walletAddress],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_JOBS).select('*')
        .eq('poster_address', walletAddress!.toLowerCase())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WorkJob[];
    },
    enabled: !!walletAddress,
  });
}

// ── Create job ───────────────────────────────────────────────
export function useCreateJob() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      job_type: WorkJobType;
      title: string;
      description: string;
      cover_image_url?: string;
      tags?: string[];
      platform?: WorkPlatform;
      target_url?: string;
      currency: WorkCurrency;
      price_per_unit: number;
      max_units: number;
      deadline?: string;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const total = params.price_per_unit * params.max_units;

      // 1) On-chain escrow funding (if contract deployed)
      let onchainJobId: number | null = null;
      let fundTxHash: string | null = null;
      if (isWorkContractDeployed()) {
        const result = await createJobOnChain({
          currency: params.currency,
          jobType: params.job_type,
          pricePerUnit: params.price_per_unit,
          maxUnits: params.max_units,
        });
        if (result) {
          const receipt = await result.wait(1);
          fundTxHash = receipt.hash;
          // onchain_job_id is reconciled later by the indexer edge function
        }
      }


      // 2) Off-chain record
      const { data, error } = await withWalletHeader(
        supabase.from(TBL_JOBS).insert({
          poster_address: walletAddress.toLowerCase(),
          job_type: params.job_type,
          title: params.title,
          description: params.description,
          cover_image_url: params.cover_image_url || null,
          tags: params.tags || [],
          platform: params.platform || null,
          target_url: params.target_url || null,
          currency: params.currency,
          price_per_unit: params.price_per_unit,
          max_units: params.max_units,
          total_budget: total,
          funded_amount: fundTxHash ? total : 0,
          deadline: params.deadline || null,
          onchain_job_id: onchainJobId,
          fund_tx_hash: fundTxHash,
          status: 'open',
        } as any).select().single(),
        walletAddress
      );
      if (error) throw error;
      return data as unknown as WorkJob;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-jobs-browse'] });
      qc.invalidateQueries({ queryKey: ['work-my-posted'] });
      toast.success('Job posted!');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to post job'),
  });
}

// ── Applications (contract jobs) ─────────────────────────────
export function useJobApplications(jobId: string | undefined) {
  return useQuery({
    queryKey: ['work-apps', jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from(TBL_APPS).select('*').eq('job_id', jobId!).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WorkApplication[];
    },
    enabled: !!jobId,
  });
}

export function useApplyToJob() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { job_id: string; cover_letter: string; proposed_amount?: number }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { data, error } = await withWalletHeader(
        supabase.from(TBL_APPS).insert({
          job_id: params.job_id,
          applicant_address: walletAddress.toLowerCase(),
          cover_letter: params.cover_letter,
          proposed_amount: params.proposed_amount ?? null,
        } as any).select().single(),
        walletAddress
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-apps', v.job_id] });
      toast.success('Application sent');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to apply'),
  });
}

export function useAwardApplicant() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { job_id: string; application_id: string; worker_address: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error: e1 } = await withWalletHeader(
        supabase.from(TBL_APPS).update({ status: 'awarded' } as any).eq('id', params.application_id),
        walletAddress
      );
      if (e1) throw e1;
      const { error: e2 } = await withWalletHeader(
        supabase.from(TBL_JOBS).update({
          awarded_worker_address: params.worker_address.toLowerCase(),
          status: 'in_progress',
        } as any).eq('id', params.job_id),
        walletAddress
      );
      if (e2) throw e2;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-apps', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job', v.job_id] });
      toast.success('Awarded — funds escrowed');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to award'),
  });
}

// ── Submissions ──────────────────────────────────────────────
export function useJobSubmissions(jobId: string | undefined) {
  return useQuery({
    queryKey: ['work-subs', jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from(TBL_SUBS).select('*').eq('job_id', jobId!).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WorkSubmission[];
    },
    enabled: !!jobId,
  });
}

export function useSubmitProof() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { job_id: string; proof_url: string; proof_text?: string; platform?: WorkPlatform }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { data, error } = await withWalletHeader(
        supabase.from(TBL_SUBS).insert({
          job_id: params.job_id,
          worker_address: walletAddress.toLowerCase(),
          proof_url: params.proof_url,
          proof_text: params.proof_text || '',
          platform: params.platform || null,
        } as any).select().single(),
        walletAddress
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-subs', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job', v.job_id] });
      toast.success('Proof submitted');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to submit proof'),
  });
}

export function useApproveSubmission() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { submission_id: string; job_id: string; payout_amount: number }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await withWalletHeader(
        supabase.from(TBL_SUBS).update({
          approval_status: 'approved',
          payout_amount: params.payout_amount,
        } as any).eq('id', params.submission_id),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-subs', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job', v.job_id] });
      toast.success('Approved — funds released');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to approve'),
  });
}

export function useRejectSubmission() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { submission_id: string; job_id: string; reason: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await withWalletHeader(
        supabase.from(TBL_SUBS).update({
          approval_status: 'rejected',
          rejection_reason: params.reason,
        } as any).eq('id', params.submission_id),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-subs', v.job_id] });
      toast.success('Submission rejected');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to reject'),
  });
}

// ── Reviews ──────────────────────────────────────────────────
export function useJobReviews(jobId: string | undefined) {
  return useQuery({
    queryKey: ['work-reviews', jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from(TBL_REVIEWS).select('*').eq('job_id', jobId!);
      if (error) throw error;
      return (data || []) as unknown as WorkReview[];
    },
    enabled: !!jobId,
  });
}

export function useUserReviews(address: string | undefined) {
  return useQuery({
    queryKey: ['work-reviews-user', address?.toLowerCase()],
    queryFn: async () => {
      const { data, error } = await supabase.from(TBL_REVIEWS).select('*').eq('reviewee_address', address!.toLowerCase()).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WorkReview[];
    },
    enabled: !!address,
  });
}

export function useLeaveReview() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { job_id: string; reviewee_address: string; reviewer_role: 'poster' | 'worker'; rating: number; comment?: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      if (params.rating < 1 || params.rating > 5) throw new Error('Rating must be 1-5');
      const { error } = await withWalletHeader(
        supabase.from(TBL_REVIEWS).insert({
          job_id: params.job_id,
          reviewer_address: walletAddress.toLowerCase(),
          reviewee_address: params.reviewee_address.toLowerCase(),
          reviewer_role: params.reviewer_role,
          rating: params.rating,
          comment: params.comment || '',
        } as any),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-reviews', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-reviews-user', v.reviewee_address.toLowerCase()] });
      toast.success('Review posted');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to leave review'),
  });
}

// ── Dispute ──────────────────────────────────────────────────
export function useOpenDispute() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { job_id: string; reason: string; evidence_url?: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error: e1 } = await withWalletHeader(
        supabase.from(TBL_DISPUTES).insert({
          job_id: params.job_id,
          opened_by_address: walletAddress.toLowerCase(),
          reason: params.reason,
          evidence_url: params.evidence_url || null,
        } as any),
        walletAddress
      );
      if (e1) throw e1;
      const { error: e2 } = await withWalletHeader(
        supabase.from(TBL_JOBS).update({ status: 'disputed' } as any).eq('id', params.job_id),
        walletAddress
      );
      if (e2) throw e2;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-job', v.job_id] });
      toast.success('Dispute opened — admin will review');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to open dispute'),
  });
}

export function useMarkComplete() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await withWalletHeader(
        supabase.from(TBL_JOBS).update({ status: 'completed' } as any).eq('id', jobId),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['work-job', jobId] });
      qc.invalidateQueries({ queryKey: ['work-jobs-browse'] });
      toast.success('Job marked complete');
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
