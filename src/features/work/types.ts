export type WorkJobType = 'shill' | 'clipping' | 'contract';
export type WorkCurrency = 'DHB' | 'USDC';
export type WorkPlatform = 'x' | 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'reddit' | 'other';
export type WorkJobStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'disputed' | 'cancelled' | 'expired';
export type WorkAppStatus = 'pending' | 'awarded' | 'rejected' | 'withdrawn';
export type WorkSubmissionStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type WorkDisputeStatus = 'open' | 'resolved_worker' | 'resolved_poster' | 'resolved_split';
export type WorkReviewRole = 'poster' | 'worker';

export interface WorkJob {
  id: string;
  onchain_job_id: number | null;
  poster_address: string;
  job_type: WorkJobType;
  title: string;
  description: string;
  cover_image_url: string | null;
  tags: string[];
  platform: WorkPlatform | null;
  target_url: string | null;
  currency: WorkCurrency;
  price_per_unit: number;
  max_units: number;
  units_approved: number;
  total_budget: number;
  funded_amount: number;
  released_amount: number;
  deadline: string | null;
  awarded_worker_address: string | null;
  status: WorkJobStatus;
  fund_tx_hash: string | null;
  boost_expires_at: string | null;
  view_count: number;
  application_count: number;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkApplication {
  id: string;
  job_id: string;
  applicant_address: string;
  cover_letter: string;
  proposed_amount: number | null;
  status: WorkAppStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkSubmission {
  id: string;
  job_id: string;
  worker_address: string;
  proof_url: string;
  proof_text: string;
  platform: WorkPlatform | null;
  view_count_cached: number;
  last_polled_at: string | null;
  approval_status: WorkSubmissionStatus;
  payout_amount: number;
  payout_tx_hash: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkReview {
  id: string;
  job_id: string;
  reviewer_address: string;
  reviewee_address: string;
  reviewer_role: WorkReviewRole;
  rating: number;
  comment: string;
  created_at: string;
}

export interface WorkDispute {
  id: string;
  job_id: string;
  opened_by_address: string;
  reason: string;
  evidence_url: string | null;
  status: WorkDisputeStatus;
  resolution_notes: string | null;
  resolved_by_address: string | null;
  resolved_at: string | null;
  worker_amount: number | null;
  poster_refund: number | null;
  resolve_tx_hash: string | null;
  created_at: string;
  updated_at: string;
}
