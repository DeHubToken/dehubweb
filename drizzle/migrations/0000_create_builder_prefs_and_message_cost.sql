CREATE TABLE public.builder_prefs (
  wallet text PRIMARY KEY,
  model text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.builder_prefs TO service_role;
REVOKE ALL ON TABLE public.builder_prefs FROM PUBLIC, anon, authenticated;
ALTER TABLE public.builder_prefs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.builder_messages
  ADD COLUMN cost_usd_micros bigint;