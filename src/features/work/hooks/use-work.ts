import { workRpc, settleWorkPayment } from '../work-rpc';
import { workEscrow, workSubmission, workJob } from '../work-escrow';
import { getWorkConfig } from '@/lib/contracts/dehub-work';
/**
 * /work — Jobs marketplace hooks
 * Off-chain ledger + on-chain escrow via DeHubWork (best-effort; falls back
 * to off-chain when the contract address is the placeholder zero address).
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
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
      let q = supabase.from(TBL_JOBS).select('*').in('status', ['open', 'in_progress']).or('deadline.is.null,deadline.gt.' + new Date().toISOString());
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
    // 5 min like the rest of the app — 30s meant nearly every return to /work
    // refired the browse query.
    staleTime: 5 * 60_000,
    // Filter/search changes keep the previous list visible while the new one
    // loads instead of flashing the skeleton grid on every keystroke.
    placeholderData: keepPreviousData,
  });
}

/**
 * Recently completed bounties, used as a fallback when nothing is open so the
 * board shows what bounties look like instead of dead-ending on an empty state.
 * Only runs when `enabled` (i.e. the live browse came back empty).
 */
export function useRecentCompletedJobs(enabled: boolean) {
  return useQuery({
    queryKey: ['work-jobs-completed'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_JOBS)
        .select('*')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data || []) as unknown as WorkJob[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * A bounty is addressable two ways and both arrive here as a route param.
 * `/bounty/7` is the canonical form and carries a `job_number`; `/work/<uuid>`
 * is the shape every link shared before the numbers existed still uses, and
 * carries the primary key. A bare run of digits is the number — uuids always
 * contain hyphens and hex letters, so the two can never be confused.
 */
function jobKeyColumn(key: string): 'id' | 'job_number' {
  return /^\d+$/.test(key) ? 'job_number' : 'id';
}

export function matchesJobKey(job: WorkJob, key: string | undefined): boolean {
  if (!key) return false;
  return jobKeyColumn(key) === 'job_number' ? String(job.job_number) === key : job.id === key;
}

export function useWorkJob(jobKey: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['work-job', jobKey],
    queryFn: async () => {
      const column = jobKeyColumn(jobKey!);
      const { data, error } = await supabase
        .from(TBL_JOBS).select('*')
        .eq(column, column === 'job_number' ? Number(jobKey) : jobKey!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as WorkJob | null;
    },
    enabled: !!jobKey,
    // Instant open from the browse list: those rows are full `select('*')`
    // WorkJob records, so paint the clicked job immediately while the
    // authoritative fetch runs behind it.
    placeholderData: () => {
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ['work-jobs-browse'] })) {
        const rows = query.state.data as WorkJob[] | undefined;
        const hit = rows?.find?.(j => matchesJobKey(j, jobKey));
        if (hit) return hit;
      }
      return undefined;
    },
  });
}

/** `enabled` lets a tabbed caller skip the fetch for a tab that isn't showing. */
export function useMyPostedJobs(enabled = true) {
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
    enabled: enabled && !!walletAddress,
    staleTime: 5 * 60_000,
  });
}

/** Every submission this wallet has made, across all jobs, newest first — the "worked on" side of bounty history. */
export function useMyWorkSubmissions(enabled = true) {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['work-my-submissions', walletAddress],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_SUBS)
        .select('*, job:work_jobs(*)' as any)
        .eq('worker_address', walletAddress!.toLowerCase())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as (WorkSubmission & { job: WorkJob | null })[];
    },
    enabled: enabled && !!walletAddress,
    staleTime: 5 * 60_000,
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
          funded_amount: 0,
          deadline: params.deadline || new Date(Date.now()+30*86400000).toISOString(),
          onchain_job_id: null,
          fund_tx_hash: null,
          status: 'draft',
        } as any).select().single(),
        walletAddress
      );
      if (error) throw error;
      return data as unknown as WorkJob;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-jobs-browse'] });
      qc.invalidateQueries({ queryKey: ['work-my-posted'] });
      toast.success('Draft saved — fund escrow to publish');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to post job'),
  });
}

// ── Edit job ─────────────────────────────────────────────────
/**
 * Poster-only edit of an existing bounty. The copy fields (title, description,
 * platform, target, deadline) are always safe to change; the money fields are
 * only sent when the caller decided they're still editable — see
 * `isBudgetEditable`. `total_budget` has to move with them or the escrow figure
 * on the card and the detail page goes stale.
 */
export function useUpdateJob() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      title: string;
      description: string;
      platform?: WorkPlatform | null;
      target_url?: string | null;
      deadline?: string | null;
      budget?: {
        currency: WorkCurrency;
        price_per_unit: number;
        max_units: number;
      };
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const current=await workJob(params.id);
      const patch: Record<string, unknown> = {
        title: params.title,
        description: params.description,
        platform: params.platform || null,
        target_url: params.target_url || null,
        deadline: current.fund_tx_hash || current.funding_state!=='unfunded' ? current.deadline : params.deadline || null,
      };
      if (params.budget) {
        patch.currency = params.budget.currency;
        patch.price_per_unit = params.budget.price_per_unit;
        patch.max_units = params.budget.max_units;
        patch.total_budget = params.budget.price_per_unit * params.budget.max_units;
      }

      const { data, error } = await withWalletHeader(
        supabase.from(TBL_JOBS).update(patch as any).eq('id', params.id).select().maybeSingle(),
        walletAddress
      );
      if (error) throw error;
      // RLS filters the row out rather than erroring when the wallet isn't the
      // poster, so an empty result is a permission failure, not a missing job.
      if (!data) throw new Error('You can only edit bounties you posted');
      return data as unknown as WorkJob;
    },
    onSuccess: (job) => {
      // A bounty is cached under whatever the URL carried: `job_number` for the
      // canonical /bounty/7 links, the uuid for the older /work/<uuid> ones.
      // Invalidating by uuid alone therefore missed the entry the page is
      // actually reading, and the five minute staleTime then suppressed any
      // refetch on remount — so the edit saved but the detail page repainted
      // the pre-edit row under a 'Bounty updated' toast. Seed both shapes with
      // the row the update returned, then sweep the prefix.
      qc.setQueryData(['work-job', job.id], job);
      if (job.job_number != null) qc.setQueryData(['work-job', String(job.job_number)], job);
      qc.invalidateQueries({ queryKey: ['work-job'] });
      qc.invalidateQueries({ queryKey: ['work-jobs-browse'] });
      qc.invalidateQueries({ queryKey: ['work-my-posted'] });
      toast.success('Bounty updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update bounty'),
  });
}

/**
 * A bounty stays editable while it's still live. Completed, cancelled, expired
 * and disputed jobs are the record of what was agreed, so they freeze — a
 * dispute in particular is being read by an admin.
 */
export function isJobEditable(job: WorkJob): boolean {
  return job.status === 'draft' || job.status === 'open' || job.status === 'in_progress';
}

/**
 * Price, units and currency stop being editable the moment the bounty stops
 * being a plain listing: once it's escrowed on-chain, once someone has applied
 * or submitted proof, or once it has left `open`. Changing the terms under
 * people who already committed work is the one edit that can't be undone.
 */
export function isBudgetEditable(job: WorkJob): boolean {
  return (
    job.status === 'draft' ||
    (job.status === 'open' &&
      !job.fund_tx_hash &&
      job.application_count === 0 &&
      job.submission_count === 0)
  );
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
    mutationFn: async (params: { job_id: string; onchain_job_id?: number | null; application_id: string; worker_address: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      await workEscrow(walletAddress).action(params.job_id,'award',params.application_id,undefined,params.worker_address);
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-apps', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job'] });
      // Not "funds escrowed": with no contract deployed this awards the work and
      // nothing else. The money moves when the submission is approved and paid.
      toast.success('Awarded — they can start work');
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
      await workEscrow(walletAddress).register(params.job_id,params.proof_url);
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
      qc.invalidateQueries({ queryKey: ['work-job'] });
      toast.success('Proof submitted');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to submit proof'),
  });
}

/**
 * Approve a submission, and — unless the poster explicitly opts out — pay it in
 * the same step.
 *
 * `pay: false` exists for the poster who settles elsewhere (an off-platform
 * transfer, a payroll run) and just wants the work marked accepted. It is a
 * deliberate choice in the UI, not the default, because the default used to be
 * the *only* behaviour and it left every worker unpaid with a green tick.
 */
export function useApproveSubmission() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      submission_id: string;
      job_id: string;
      onchain_job_id?: number | null;
      currency: WorkCurrency;
      worker_address: string;
      payout_amount: number;
      total_budget: number;
      units?: number;
      views?: number;
      evidence_url?: string;
      pay: boolean;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      await workRpc(walletAddress, 'work_approve', {
        p_submission: params.submission_id, p_views: params.views ?? null, p_evidence: params.evidence_url ?? null,
      });
      const state = params.pay ? await settleWorkPayment(walletAddress, params.submission_id) : null;
      return { paid: state === 'confirmed', pending: state === 'pending' };
    },
    onSuccess: (result, v) => {
      qc.invalidateQueries({ queryKey: ['work-subs', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job'] });
      qc.invalidateQueries({ queryKey: ['work-my-submissions'] });
      toast.success(result.paid ? 'Approved and paid' : result.pending ? 'Payment submitted — confirmation pending' : 'Approved — not paid yet');
    },
    onSettled: (_result, _error, variables) => {
      qc.invalidateQueries({ queryKey: ['work-subs', variables.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to approve'),
  });
}

/**
 * Pay a submission that was already approved.
 *
 * The reason this exists as its own action: approval and payment were the same
 * button for the feature's whole life, and that button never moved money, so
 * there is a backlog of rows sitting `approved` with a null `payout_tx_hash`
 * and a worker waiting on them. Without a retroactive path those debts are
 * unreachable from the UI and can only ever be settled off-platform.
 */
export function usePaySubmission() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      submission_id: string;
      job_id: string;
      onchain_job_id?: number | null;
      currency: WorkCurrency;
      worker_address: string;
      payout_amount: number;
      recovery_hash?: string;
      total_budget: number;
      units?: number;
      views?: number;
      evidence_url?: string;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      return settleWorkPayment(walletAddress, params.submission_id, params.recovery_hash);
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-subs', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job'] });
      qc.invalidateQueries({ queryKey: ['work-my-submissions'] });
      toast.success('Payment checked — refresh the submission for its confirmed status');
    },
    onSettled: (_result, _error, variables) => {
      qc.invalidateQueries({ queryKey: ['work-subs', variables.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job'] });
    },
    onError: (e: any) => toast.error(e.message || 'Payment failed'),
  });
}


export function useRejectSubmission() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { submission_id: string; job_id: string; reason: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const sub=await workSubmission(params.submission_id);
      await workEscrow(walletAddress).action(params.job_id,'reject',params.submission_id,params.reason,undefined,sub.proof_url);
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
    mutationFn: async (params: { job_id: string; onchain_job_id?: number | null; reason: string; evidence_url?: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      await workEscrow(walletAddress).action(params.job_id,'dispute',params.job_id,params.reason);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-job'] });
      qc.invalidateQueries({ queryKey: ['work-disputes-admin'] });
      toast.success('Dispute opened — admin will review');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to open dispute'),
  });
}

// ── Admin: disputes queue + resolve ──────────────────────────
export function useAdminDisputes() {
  return useQuery({
    queryKey: ['work-disputes-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_DISPUTES)
        .select('*, job:work_jobs(*)' as any)
        .eq('status', 'open')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 15_000,
  });
}

export function useAdminResolveDispute() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      dispute_id: string;
      job_id: string;
      onchain_job_id?: number | null;
      currency: WorkCurrency;
      worker_address: string;
      worker_amount: number;
      poster_refund: number;
      resolution_notes?: string;
      /**
       * Send the worker's share from the arbiter's own wallet as part of
       * resolving. Only meaningful while there is no escrow to split: the
       * contract holds nothing, so a resolution is otherwise pure bookkeeping
       * and the worker still has to chase the poster. Opt-in, because it spends
       * the arbiter's money rather than the job's.
       */
      pay_worker?: boolean;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const {data:subs,error}=await supabase.from(TBL_SUBS).select('*').eq('job_id',params.job_id).in('approval_status',['pending','approved']).order('created_at');
      if(error) throw error;
      const selected=(subs as any[])?.find(s=>s.worker_address===params.worker_address.toLowerCase());
      if((subs as any[])?.some(s=>s.id!==selected?.id)) throw new Error('Review and settle other submissions before resolving');
      await workEscrow(walletAddress).resolve(params,selected?.proof_url);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-disputes-admin'] });
      toast.success('Dispute resolved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to resolve'),
  });
}


export function useMarkComplete() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      if (!walletAddress) throw new Error('Not authenticated');
      await workEscrow(walletAddress).action(jobId,'complete',jobId,undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-job'] });
      qc.invalidateQueries({ queryKey: ['work-jobs-browse'] });
      toast.success('Job marked complete');
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}

export function useWorkConfig() {
 return useQuery({queryKey:['work-config'],queryFn:getWorkConfig,staleTime:60000});
}
export function useFundJob() {
 const {walletAddress}=useAuth(); const qc=useQueryClient();
 return useMutation({mutationFn:async(params:{job_id:string;hash?:string;release?:boolean})=>{
  if(!walletAddress) throw new Error('Not authenticated');
  if(params.release) {
   if(localStorage.getItem('work-funding:'+params.job_id)) throw new Error('A funding transaction is saved. Check it first.');
   await workRpc(walletAddress,'work_record_funding',{p_job:params.job_id,p_cancel:true}); return 'released';
  }
  return workEscrow(walletAddress).fund(params.job_id,params.hash);
 },onSettled:()=>{qc.invalidateQueries({queryKey:['work-job']});qc.invalidateQueries({queryKey:['work-my-posted']});qc.invalidateQueries({queryKey:['work-jobs-browse']});},
 onSuccess:state=>toast.success(state==='confirmed'?'Bounty funded and published':state==='pending'?'Funding submitted — check confirmation':'Rejected signature released'),onError:(e:any)=>toast.error(e.message)});
}
export function useReleasePayment() {
 const {walletAddress}=useAuth(); const qc=useQueryClient();
 return useMutation({mutationFn:async(submission:string)=>{
  if(!walletAddress) throw new Error('Not authenticated');
  const {data,error}=await supabase.from('work_payment_intents' as any).select('id').eq('submission_id',submission).eq('state','signing').single();
  if(error) throw error;
  const id=(data as any).id;
  if(localStorage.getItem('work-payment:'+id)) throw new Error('A payment transaction is saved. Check it first.');
  await workRpc(walletAddress,'work_cancel_signature',{p_intent:id});
 },onSettled:()=>qc.invalidateQueries({queryKey:['work-subs']}),onError:(e:any)=>toast.error(e.message)});
}
