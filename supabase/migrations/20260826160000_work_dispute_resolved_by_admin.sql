-- work_disputes: record the godmode seat that arbitrated.
--
-- A dispute can now be resolved two ways. dehubweb's /work/disputes is
-- wallet-authenticated and writes `resolved_by_address`; godmode's Bounty
-- Disputes page authenticates an admin against the DeHub API and has no wallet
-- at all, so it writes the admin's seat here instead.
--
-- Two columns rather than one overloaded field: putting an email in a column
-- named `..._address` makes every future reader guess, and the two identities
-- are not interchangeable — one is on-chain and one is a staff login.
alter table public.work_disputes
  add column if not exists resolved_by_admin text;

comment on column public.work_disputes.resolved_by_admin is
  'Godmode admin seat (email) that resolved this dispute; null when resolved by wallet via /work/disputes.';
