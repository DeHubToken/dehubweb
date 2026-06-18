
-- Enums
CREATE TYPE public.work_job_type AS ENUM ('shill', 'clipping', 'contract');
CREATE TYPE public.work_currency AS ENUM ('DHB', 'USDC');
CREATE TYPE public.work_platform AS ENUM ('x', 'youtube', 'instagram', 'tiktok', 'facebook', 'reddit', 'other');
CREATE TYPE public.work_job_status AS ENUM ('draft', 'open', 'in_progress', 'completed', 'disputed', 'cancelled', 'expired');
CREATE TYPE public.work_app_status AS ENUM ('pending', 'awarded', 'rejected', 'withdrawn');
CREATE TYPE public.work_submission_status AS ENUM ('pending', 'approved', 'rejected', 'paid');
CREATE TYPE public.work_dispute_status AS ENUM ('open', 'resolved_worker', 'resolved_poster', 'resolved_split');
CREATE TYPE public.work_review_role AS ENUM ('poster', 'worker');

-- Jobs
CREATE TABLE public.work_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  onchain_job_id BIGINT UNIQUE,
  poster_address TEXT NOT NULL,
  job_type public.work_job_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  tags TEXT[] DEFAULT '{}',
  platform public.work_platform,
  target_url TEXT,
  currency public.work_currency NOT NULL DEFAULT 'DHB',
  price_per_unit NUMERIC(38, 18) NOT NULL DEFAULT 0,
  max_units INT NOT NULL DEFAULT 1,
  units_approved INT NOT NULL DEFAULT 0,
  total_budget NUMERIC(38, 18) NOT NULL DEFAULT 0,
  funded_amount NUMERIC(38, 18) NOT NULL DEFAULT 0,
  released_amount NUMERIC(38, 18) NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ,
  awarded_worker_address TEXT,
  status public.work_job_status NOT NULL DEFAULT 'draft',
  fund_tx_hash TEXT,
  boost_expires_at TIMESTAMPTZ,
  view_count INT NOT NULL DEFAULT 0,
  application_count INT NOT NULL DEFAULT 0,
  submission_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.work_jobs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_jobs TO authenticated;
GRANT ALL ON public.work_jobs TO service_role;
ALTER TABLE public.work_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view jobs" ON public.work_jobs FOR SELECT USING (true);
CREATE POLICY "Poster can insert own jobs" ON public.work_jobs FOR INSERT WITH CHECK (lower(poster_address) = public.get_request_wallet_address());
CREATE POLICY "Poster can update own jobs" ON public.work_jobs FOR UPDATE USING (lower(poster_address) = public.get_request_wallet_address()) WITH CHECK (lower(poster_address) = public.get_request_wallet_address());
CREATE POLICY "Poster can delete draft jobs" ON public.work_jobs FOR DELETE USING (lower(poster_address) = public.get_request_wallet_address() AND status = 'draft');

CREATE INDEX idx_work_jobs_status ON public.work_jobs(status);
CREATE INDEX idx_work_jobs_poster ON public.work_jobs(lower(poster_address));
CREATE INDEX idx_work_jobs_type ON public.work_jobs(job_type);
CREATE INDEX idx_work_jobs_created ON public.work_jobs(created_at DESC);

-- Applications (contract jobs)
CREATE TABLE public.work_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.work_jobs(id) ON DELETE CASCADE,
  applicant_address TEXT NOT NULL,
  cover_letter TEXT NOT NULL DEFAULT '',
  proposed_amount NUMERIC(38, 18),
  status public.work_app_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, applicant_address)
);

GRANT SELECT ON public.work_applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_applications TO authenticated;
GRANT ALL ON public.work_applications TO service_role;
ALTER TABLE public.work_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view applications" ON public.work_applications FOR SELECT USING (true);
CREATE POLICY "Applicant can apply" ON public.work_applications FOR INSERT WITH CHECK (lower(applicant_address) = public.get_request_wallet_address());
CREATE POLICY "Applicant or poster can update" ON public.work_applications FOR UPDATE USING (
  lower(applicant_address) = public.get_request_wallet_address()
  OR EXISTS (SELECT 1 FROM public.work_jobs j WHERE j.id = job_id AND lower(j.poster_address) = public.get_request_wallet_address())
);
CREATE POLICY "Applicant can withdraw" ON public.work_applications FOR DELETE USING (lower(applicant_address) = public.get_request_wallet_address());

CREATE INDEX idx_work_apps_job ON public.work_applications(job_id);
CREATE INDEX idx_work_apps_applicant ON public.work_applications(lower(applicant_address));

-- Submissions
CREATE TABLE public.work_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.work_jobs(id) ON DELETE CASCADE,
  worker_address TEXT NOT NULL,
  proof_url TEXT NOT NULL,
  proof_text TEXT DEFAULT '',
  platform public.work_platform,
  view_count_cached INT NOT NULL DEFAULT 0,
  last_polled_at TIMESTAMPTZ,
  approval_status public.work_submission_status NOT NULL DEFAULT 'pending',
  payout_amount NUMERIC(38, 18) NOT NULL DEFAULT 0,
  payout_tx_hash TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.work_submissions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_submissions TO authenticated;
GRANT ALL ON public.work_submissions TO service_role;
ALTER TABLE public.work_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view submissions" ON public.work_submissions FOR SELECT USING (true);
CREATE POLICY "Worker can submit" ON public.work_submissions FOR INSERT WITH CHECK (lower(worker_address) = public.get_request_wallet_address());
CREATE POLICY "Worker or poster can update submission" ON public.work_submissions FOR UPDATE USING (
  lower(worker_address) = public.get_request_wallet_address()
  OR EXISTS (SELECT 1 FROM public.work_jobs j WHERE j.id = job_id AND lower(j.poster_address) = public.get_request_wallet_address())
);
CREATE POLICY "Worker can delete pending submission" ON public.work_submissions FOR DELETE USING (
  lower(worker_address) = public.get_request_wallet_address() AND approval_status = 'pending'
);

CREATE INDEX idx_work_sub_job ON public.work_submissions(job_id);
CREATE INDEX idx_work_sub_worker ON public.work_submissions(lower(worker_address));
CREATE INDEX idx_work_sub_status ON public.work_submissions(approval_status);

-- Reviews
CREATE TABLE public.work_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.work_jobs(id) ON DELETE CASCADE,
  reviewer_address TEXT NOT NULL,
  reviewee_address TEXT NOT NULL,
  reviewer_role public.work_review_role NOT NULL,
  rating SMALLINT NOT NULL,
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, reviewer_address)
);

ALTER TABLE public.work_reviews ADD CONSTRAINT work_reviews_rating_range CHECK (rating BETWEEN 1 AND 5);

GRANT SELECT ON public.work_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_reviews TO authenticated;
GRANT ALL ON public.work_reviews TO service_role;
ALTER TABLE public.work_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reviews" ON public.work_reviews FOR SELECT USING (true);
CREATE POLICY "Reviewer can write own review" ON public.work_reviews FOR INSERT WITH CHECK (lower(reviewer_address) = public.get_request_wallet_address());
CREATE POLICY "Reviewer can edit own review" ON public.work_reviews FOR UPDATE USING (lower(reviewer_address) = public.get_request_wallet_address());
CREATE POLICY "Reviewer can delete own review" ON public.work_reviews FOR DELETE USING (lower(reviewer_address) = public.get_request_wallet_address());

CREATE INDEX idx_work_reviews_reviewee ON public.work_reviews(lower(reviewee_address));
CREATE INDEX idx_work_reviews_job ON public.work_reviews(job_id);

-- View snapshots (clipping)
CREATE TABLE public.work_view_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.work_submissions(id) ON DELETE CASCADE,
  view_count INT NOT NULL,
  polled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.work_view_snapshots TO anon;
GRANT SELECT ON public.work_view_snapshots TO authenticated;
GRANT ALL ON public.work_view_snapshots TO service_role;
ALTER TABLE public.work_view_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view snapshots" ON public.work_view_snapshots FOR SELECT USING (true);

CREATE INDEX idx_work_snap_sub ON public.work_view_snapshots(submission_id, polled_at DESC);

-- Disputes
CREATE TABLE public.work_disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.work_jobs(id) ON DELETE CASCADE,
  opened_by_address TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_url TEXT,
  status public.work_dispute_status NOT NULL DEFAULT 'open',
  resolution_note TEXT,
  resolution_tx_hash TEXT,
  worker_amount NUMERIC(38, 18),
  poster_refund NUMERIC(38, 18),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.work_disputes TO anon;
GRANT SELECT, INSERT, UPDATE ON public.work_disputes TO authenticated;
GRANT ALL ON public.work_disputes TO service_role;
ALTER TABLE public.work_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view disputes" ON public.work_disputes FOR SELECT USING (true);
CREATE POLICY "Participants can open dispute" ON public.work_disputes FOR INSERT WITH CHECK (lower(opened_by_address) = public.get_request_wallet_address());
CREATE POLICY "Participants can update dispute" ON public.work_disputes FOR UPDATE USING (
  lower(opened_by_address) = public.get_request_wallet_address()
  OR EXISTS (SELECT 1 FROM public.work_jobs j WHERE j.id = job_id AND (lower(j.poster_address) = public.get_request_wallet_address() OR lower(COALESCE(j.awarded_worker_address,'')) = public.get_request_wallet_address()))
);

CREATE INDEX idx_work_disp_job ON public.work_disputes(job_id);
CREATE INDEX idx_work_disp_status ON public.work_disputes(status);

-- updated_at triggers
CREATE TRIGGER trg_work_jobs_updated BEFORE UPDATE ON public.work_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_work_apps_updated BEFORE UPDATE ON public.work_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_work_sub_updated BEFORE UPDATE ON public.work_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_work_disp_updated BEFORE UPDATE ON public.work_disputes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Counter triggers
CREATE OR REPLACE FUNCTION public.work_update_app_count() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tj UUID;
BEGIN
  tj := COALESCE(NEW.job_id, OLD.job_id);
  UPDATE public.work_jobs SET application_count = (SELECT COUNT(*) FROM public.work_applications WHERE job_id = tj) WHERE id = tj;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_work_app_count AFTER INSERT OR DELETE ON public.work_applications FOR EACH ROW EXECUTE FUNCTION public.work_update_app_count();

CREATE OR REPLACE FUNCTION public.work_update_sub_count() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tj UUID;
BEGIN
  tj := COALESCE(NEW.job_id, OLD.job_id);
  UPDATE public.work_jobs SET submission_count = (SELECT COUNT(*) FROM public.work_submissions WHERE job_id = tj) WHERE id = tj;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_work_sub_count AFTER INSERT OR DELETE ON public.work_submissions FOR EACH ROW EXECUTE FUNCTION public.work_update_sub_count();
