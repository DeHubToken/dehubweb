create table if not exists public.social_farcaster_signers (
  wallet_address text primary key,
  signer_uuid text not null,
  public_key text,
  fid bigint,
  username text,
  status text not null default 'pending_approval',
  approval_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.social_farcaster_signers enable row level security;