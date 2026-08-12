-- Who is challenging: the lobby shows a name, an avatar, a badge and a
-- record. Identity (username, avatar, badge balance) comes from
-- api.dehub.io's public account_info endpoint client-side; the RECORD is
-- ours alone, and it is derived here rather than stored — a counter column
-- would drift from the matches the moment anything retried or raced, and
-- this table is small enough that deriving is free.
--
-- security_invoker so the view reads chess_matches under the caller's own
-- RLS (public SELECT) rather than the owner's — the view must never become
-- a wider window than the table it reads.
create view public.chess_records
with (security_invoker = true) as
select
  wallet,
  count(*)::integer as played,
  (count(*) filter (where won))::integer as wins,
  (count(*) filter (where winner is not null and not won))::integer as losses,
  (count(*) filter (where winner is null))::integer as draws
from (
  select white_wallet as wallet, winner, (winner = 'w') as won
    from public.chess_matches
    where status = 'finished'
  union all
  select black_wallet, winner, (winner = 'b')
    from public.chess_matches
    where status = 'finished'
) as sides
group by wallet;
