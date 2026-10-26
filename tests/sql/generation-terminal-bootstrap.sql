CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.ai_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),wallet_address text NOT NULL,tx_hash text UNIQUE NOT NULL,chain text DEFAULT 'base',paid_dhb numeric NOT NULL,remaining_dhb numeric NOT NULL,purpose text DEFAULT 'job',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.ai_payment_refunds(job_id text PRIMARY KEY,payment_id uuid REFERENCES ai_payments(id),dhb numeric NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE public.ai_generation_jobs(id uuid PRIMARY KEY,wallet_address text NOT NULL,tx_hash text,price_dhb numeric NOT NULL,kind text NOT NULL,model text NOT NULL,endpoint text NOT NULL,provider text,prediction_id text,provider_app text,status text NOT NULL DEFAULT 'submitting',result jsonb,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),payment_source text NOT NULL DEFAULT 'dhb',credit_debit_key text,UNIQUE(endpoint,prediction_id));
ALTER TABLE public.ai_generation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_generation_jobs FROM anon,authenticated;
GRANT ALL ON public.ai_generation_jobs,public.ai_payments,public.ai_payment_refunds TO service_role;

INSERT INTO ai_payments(wallet_address,tx_hash,paid_dhb,remaining_dhb) VALUES('owner','receipt',10000,1000);
INSERT INTO ai_generation_jobs(id,wallet_address,tx_hash,price_dhb,kind,model,endpoint,created_at)
SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'owner','receipt',100,'video','test','generate-video',now()-interval '2 hours' FROM generate_series(1,30) i;
UPDATE ai_generation_jobs SET payment_source='credits',credit_debit_key='ai:test-credit',tx_hash=NULL WHERE id='00000000-0000-4000-8000-000000000005';
