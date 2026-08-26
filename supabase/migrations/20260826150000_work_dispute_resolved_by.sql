-- work_disputes: record who arbitrated a dispute.
--
-- `useAdminResolveDispute` has always written `resolved_by_address` alongside
-- `resolved_at`, but the column was never created — PostgREST answered
-- `42703 column does not exist` and the whole resolve path failed, which is why
-- bounty #2 has sat `disputed` since 2026-06-30. The hook also wrote
-- `resolve_tx_hash` / `resolution_notes` against the real `resolution_tx_hash` /
-- `resolution_note`; those two are fixed in the code rather than the schema.
--
-- Added here rather than dropped from the code because an arbitration decision
-- that cannot say who made it is not an audit trail. Nullable, so the rows
-- resolved before this point stay valid.
alter table public.work_disputes
  add column if not exists resolved_by_address text;

comment on column public.work_disputes.resolved_by_address is
  'Lowercased wallet of the arbiter who resolved this dispute; null for unresolved rows.';
