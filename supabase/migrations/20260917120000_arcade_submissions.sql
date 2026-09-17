CREATE TABLE IF NOT EXISTS public.arcade_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 100),
  contact_email text NOT NULL CHECK (char_length(contact_email) <= 254 AND contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  playable_url text NOT NULL CHECK (char_length(playable_url) <= 2048 AND playable_url ~* '^https://[^[:space:]]+$'),
  source_url text CHECK (source_url IS NULL OR (char_length(source_url) <= 2048 AND source_url ~* '^https://[^[:space:]]+$')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 20 AND 2000),
  mobile_support boolean NOT NULL DEFAULT false,
  rights_confirmed boolean NOT NULL CHECK (rights_confirmed)
);

CREATE INDEX IF NOT EXISTS arcade_submissions_pending_idx ON public.arcade_submissions (created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.arcade_submissions ENABLE ROW LEVEL SECURITY;

-- Public proposals are private until reviewed. Only the service role can read
-- or change status; the browser receives no select, update, or delete policy.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'arcade_submissions'
      AND policyname = 'Anyone can propose an arcade game'
  ) THEN
    CREATE POLICY "Anyone can propose an arcade game"
      ON public.arcade_submissions FOR INSERT TO anon, authenticated
      WITH CHECK (status = 'pending' AND rights_confirmed);
  END IF;
END $$;

GRANT INSERT ON public.arcade_submissions TO anon, authenticated;
