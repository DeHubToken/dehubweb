/**
 * /work â€” Jobs marketplace hooks
 * Off-chain ledger + on-chain escrow via DeHubWork (best-effort; falls back
 * to off-chain when the contract address is the placeholder zero address).
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  payWorkerDirect,
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


// â”€â”€ Browse jobs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // 5 min like the rest of the app â€” 30s meant nearly every return to /work
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
 * carries the primary key. A bare run of digits is the number â€” uuids always
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

/** Every submission this wallet has made, across all jobs, newest first â€” the "worked on" side of bounty history. */
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

// â”€â”€ Create job â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Edit job â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Poster-only edit of an existing bounty. The copy fields (title, description,
 * platform, target, deadline) are always safe to change; the money fields are
 * only sent when the caller decided they're still editable â€” see
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

      const patch: Record<string, unknown> = {
        title: params.title,
        description: params.description,
        platform: params.platform || null,
        target_url: params.target_url || null,
        deadline: params.deadline || null,
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
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-job', v.id] });
      qc.invalidateQueries({ queryKey: ['work-jobs-browse'] });
      qc.invalidateQueries({ queryKey: ['work-my-posted'] });
      toast.success('Bounty updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update bounty'),
  });
}

/**
 * A bounty stays editable while it's still live. Completed, cancelled, expired
 * and disputed jobs are the record of what was agreed, so they freeze â€” a
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

// â”€â”€ Applications (contract jobs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      if (isWorkContractDeployed() && params.onchain_job_id) {
        const r = await awardApplicantOnChain(params.onchain_job_id, params.worker_address);
        if (r) await r.wait(1);
      }

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
      // Not "funds escrowed": with no contract deployed this awards the work and
      // nothing else. The money moves when the submission is approved and paid.
      toast.success('Awarded â€” they can start work');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to award'),
  });
}


// â”€â”€ Submissions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

/**
 * Settle one approved submission on-chain and return the transaction hash.
 *
 * Two routes, in preference order: release from escrow when the job was funded
 * through a deployed DeHubWork, otherwise a direct ERC-20 transfer from the
 * poster's wallet. Today only the second exists â€” see `payWorkerDirect`. Either
 * way the caller gets a real hash back, and a payout without one is not
 * recorded as paid.
 */
async function releasePayout(params: {
  currency: WorkCurrency;
  onchain_job_id?: number | null;
  worker_address: string;
  payout_amount: number;
  units?: number;
}): Promise<string> {
  if (isWorkContractDeployed() && params.onchain_job_id) {
    const r = await approveSubmissionOnChain(params.onchain_job_id, params.worker_address, params.units ?? 1);
    if (r) {
      const rec = await r.wait(1);
      return rec.hash;
    }
  }
  const r = await payWorkerDirect({
    currency: params.currency,
    to: params.worker_address,
    amount: params.payout_amount,
  });
  const rec = await r.wait(1);
  return rec.hash;
}

/**
 * Recompute a job's rollups from its submissions.
 *
 * Nothing in the database maintains `units_approved` or `released_amount` â€”
 * only `application_count` and `submission_count` have triggers â€” so both sat
 * at zero while the detail page printed "0/N slots" over genuinely approved
 * work. Summing the children rather than incrementing makes this self-healing:
 * a payout that races another, or a row fixed by hand, converges on the next
 * write instead of drifting further.
 */
async function syncJobTotals(jobId: string, walletAddress: string) {
  const { data } = await supabase
    .from(TBL_SUBS)
    .select('approval_status, payout_amount, payout_tx_hash')
    .eq('job_id', jobId);
  const rows = (data || []) as unknown as Pick<WorkSubmission, 'approval_status' | 'payout_amount' | 'payout_tx_hash'>[];

  const unitsApproved = rows.filter(r => r.approval_status === 'approved' || r.approval_status === 'paid').length;
  const released = rows
    .filter(r => !!r.payout_tx_hash)
    .reduce((sum, r) => sum + Number(r.payout_amount || 0), 0);

  // Best-effort: a poster who just paid should not see an error because a
  // derived counter failed to write. The money already moved.
  await withWalletHeader(
    supabase.from(TBL_JOBS).update({
      units_approved: unitsApproved,
      released_amount: released,
    } as any).eq('id', jobId),
    walletAddress
  );
}

/**
 * Approve a submission, and â€” unless the poster explicitly opts out â€” pay it in
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
      units?: number;
      pay: boolean;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const txHash = params.pay ? await releasePayout(params) : null;

      const { error } = await withWalletHeader(
        supabase.from(TBL_SUBS).update({
          approval_status: txHash ? 'paid' : 'approved',
          payout_amount: params.payout_amount,
          payout_tx_hash: txHash,
        } as any).eq('id', params.submission_id),
        walletAddress
      );
      if (error) throw error;
      await syncJobTotals(params.job_id, walletAddress);
      return { paid: !!txHash };
    },
    onSuccess: (result, v) => {
      qc.invalidateQueries({ queryKey: ['work-subs', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-my-submissions'] });
      toast.success(result.paid ? 'Approved and paid' : 'Approved â€” not paid yet');
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
      units?: number;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const txHash = await releasePayout(params);

      const { error } = await withWalletHeader(
        supabase.from(TBL_SUBS).update({
          approval_status: 'paid',
          payout_amount: params.payout_amount,
          payout_tx_hash: txHash,
        } as any).eq('id', params.submission_id),
        walletAddress
      );
      if (error) throw error;
      await syncJobTotals(params.job_id, walletAddress);
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['work-subs', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job', v.job_id] });
      qc.invalidateQueries({ queryKey: ['work-my-submissions'] });
      toast.success('Payment sent');
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

// â”€â”€ Reviews â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Dispute â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useOpenDispute() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { job_id: string; onchain_job_id?: number | null; reason: string; evidence_url?: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      if (isWorkContractDeployed() && params.onchain_job_id) {
        const r = await openDisputeOnChain(params.onchain_job_id);
        if (r) await r.wait(1);
      }

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
      qc.invalidateQueries({ queryKey: ['work-disputes-admin'] });
      toast.success('Dispute opened â€” admin will review');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to open dispute'),
  });
}

// â”€â”€ Admin: disputes queue + resolve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      let txHash: string | null = null;
      if (isWorkContractDeployed() && params.onchain_job_id) {
        const r = await adminResolveOnChain({
          jobId: params.onchain_job_id,
          worker: params.worker_address,
          currency: params.currency,
          workerAmount: params.worker_amount,
          posterRefund: params.poster_refund,
        });
        if (r) { const rec = await r.wait(1); txHash = rec.hash; }
      } else if (params.pay_worker && params.worker_amount > 0) {
        const r = await payWorkerDirect({
          currency: params.currency,
          to: params.worker_address,
          amount: params.worker_amount,
        });
        const rec = await r.wait(1);
        txHash = rec.hash;
      }

      const newStatus =
        params.worker_amount > 0 && params.poster_refund > 0 ? 'resolved_split'
        : params.worker_amount > 0 ? 'resolved_worker'
        : 'resolved_poster';

      // Column names verified against the live schema. Three of these were
      // wrong since day one â€” `resolve_tx_hash`, `resolution_notes` and a
      // `resolved_by_address` that did not exist at all â€” so every resolve
      // attempt came back `42703 column does not exist` and bounty #2 has sat
      // disputed since June. Every `work_*` table is reached through an `as any`
      // cast, so tsc could never have caught it; check PostgREST, not the types.
      const { error: e1 } = await withWalletHeader(
        supabase.from(TBL_DISPUTES).update({
          status: newStatus,
          resolved_by_address: walletAddress.toLowerCase(),
          resolved_at: new Date().toISOString(),
          worker_amount: params.worker_amount,
          poster_refund: params.poster_refund,
          resolution_tx_hash: txHash,
          resolution_note: params.resolution_notes || null,
        } as any).eq('id', params.dispute_id),
        walletAddress
      );
      if (e1) throw e1;

      const { error: e2 } = await withWalletHeader(
        supabase.from(TBL_JOBS).update({ status: 'completed' } as any).eq('id', params.job_id),
        walletAddress
      );
      if (e2) throw e2;
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
