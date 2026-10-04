CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA wallet_auth;
CREATE TABLE wallet_auth.secret (id integer PRIMARY KEY, key bytea);
INSERT INTO wallet_auth.secret VALUES (1,decode(repeat('11',32),'hex'));
CREATE SCHEMA cron;
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE TYPE public.work_job_type AS ENUM ('shill','clipping','contract');
CREATE TYPE public.work_currency AS ENUM ('DHB','USDC');
CREATE TYPE public.work_job_status AS ENUM ('draft','open','in_progress','completed','disputed','cancelled','expired');
CREATE TYPE public.work_app_status AS ENUM ('pending','awarded','rejected','withdrawn');
CREATE TYPE public.work_submission_status AS ENUM ('pending','approved','rejected','paid');
CREATE TYPE public.work_dispute_status AS ENUM ('open','resolved_worker','resolved_poster','resolved_split');
CREATE TABLE public.work_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), onchain_job_id bigint UNIQUE, poster_address text NOT NULL,
  job_type public.work_job_type NOT NULL, title text NOT NULL, description text DEFAULT '', cover_image_url text,
  tags text[] DEFAULT '{}', platform text, target_url text, currency public.work_currency DEFAULT 'DHB',
  price_per_unit numeric DEFAULT 0, max_units integer DEFAULT 1, units_approved integer DEFAULT 0,
  total_budget numeric DEFAULT 0, funded_amount numeric DEFAULT 0, released_amount numeric DEFAULT 0,
  deadline timestamptz, awarded_worker_address text, status public.work_job_status DEFAULT 'draft', fund_tx_hash text,
  application_count integer DEFAULT 0, submission_count integer DEFAULT 0, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.work_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES public.work_jobs(id), applicant_address text,
  cover_letter text DEFAULT '', proposed_amount numeric, status public.work_app_status DEFAULT 'pending',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(job_id,applicant_address)
);
CREATE TABLE public.work_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES public.work_jobs(id), worker_address text,
  proof_url text, proof_text text DEFAULT '', platform text, view_count_cached integer DEFAULT 0, last_polled_at timestamptz,
  approval_status public.work_submission_status DEFAULT 'pending', payout_amount numeric DEFAULT 0, payout_tx_hash text,
  rejection_reason text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.work_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES public.work_jobs(id), reviewer_address text,
  reviewee_address text, reviewer_role text, rating integer CHECK(rating BETWEEN 1 AND 5), comment text DEFAULT '', created_at timestamptz DEFAULT now()
);
CREATE TABLE public.work_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES public.work_jobs(id), opened_by_address text,
  reason text, evidence_url text, status public.work_dispute_status DEFAULT 'open', resolution_note text, resolution_tx_hash text,
  worker_amount numeric, poster_refund numeric, resolved_by_address text, resolved_by_admin text, resolved_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.work_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_jobs_read ON public.work_jobs FOR SELECT USING (true);
CREATE POLICY fixture_apps_read ON public.work_applications FOR SELECT USING (true);
CREATE POLICY fixture_subs_read ON public.work_submissions FOR SELECT USING (true);
CREATE POLICY fixture_reviews_read ON public.work_reviews FOR SELECT USING (true);
CREATE POLICY fixture_disputes_read ON public.work_disputes FOR SELECT USING (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;
