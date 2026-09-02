-- One DHB transfer pays for one thing.
--
-- NOT YET APPLIED. Migrations in this repo are run by hand in the SQL editor.
-- `claimDhbPayment` falls back to verify-only while this is missing, so the
-- code that uses it is safe to ship first; the hole below just stays open
-- until the table exists.
--
-- `verifyDhbPayment` answers one question — did this wallet send at least N DHB
-- to the treasury in the last hour — and records nothing. Every feature that
-- asks then keeps its own private ledger of spent hashes: ai_payments,
-- voice_clone_payments, governance_proposals.fee_tx_hash, ad_payments,
-- stage_dub_usage.settled_ref. None of them can see the others.
--
-- So one transfer was redeemable five times. Send 10,000 DHB once as a
-- governance proposal fee, and within the same hour the same hash opens a
-- 10,000 DHB AI receipt, buys a 1,200 DHB stage voice, and settles a dubbing
-- tab. Four purchases, one payment.
--
-- This is the shared ledger those five were missing. It does not replace them:
-- each still stops the same hash paying twice WITHIN its own feature, at the
-- granularity it cares about (per proposal, per voice, per tab). This stops it
-- crossing BETWEEN features, which is the part nobody owned.

create table if not exists public.dhb_payment_claims (
  -- The hash is the identity. Lowercased by the caller, as everywhere else.
  tx_hash text primary key,
  -- What it was spent on: 'ai', 'dub', 'voice-clone', 'governance', 'ads'.
  -- Re-presenting a hash for the SAME purpose is a retry and is allowed — the
  -- feature's own table decides whether that particular retry is legitimate.
  -- A different purpose is a replay and is refused.
  purpose text not null,
  wallet_address text not null,
  dhb integer not null,
  chain text,
  claimed_at timestamptz not null default now()
);

-- Only the service role, through the edge functions. A listener never reads
-- this; they read their own feature's row.
alter table public.dhb_payment_claims enable row level security;

create index if not exists dhb_payment_claims_wallet_idx
  on public.dhb_payment_claims (wallet_address, claimed_at desc);
