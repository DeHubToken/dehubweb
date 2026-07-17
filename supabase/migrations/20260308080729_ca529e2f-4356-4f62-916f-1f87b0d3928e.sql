CREATE TABLE public.user_feedback_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  signup_experience text,
  referral_source text,
  gender text,
  age_range text,
  tipping_or_gifting text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_feedback_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert survey responses"
  ON public.user_feedback_surveys
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view own survey responses"
  ON public.user_feedback_surveys
  FOR SELECT
  USING (true);
