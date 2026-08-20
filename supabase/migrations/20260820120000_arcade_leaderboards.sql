-- Arcade leaderboards
-- ===================
-- Two games, two very different kinds of board, and one deliberate split
-- between them.
--
-- Street Slayer is a RUN board: a player plays alone, the run produces a
-- number, and the board keeps that player's best. Nothing in the database can
-- check that number, so the number never arrives as a number at all — the game
-- reports what is happening WHILE it happens, the `arcade-score` edge function
-- accrues it into `arcade_runs` under the service role against a clock it owns,
-- and the score is composed from the server's own record at the end. That is
-- why neither table here has a write policy: it is the posture chess_matches
-- already takes, for the same reason. A client-writable board is a
-- client-writable ranking, and these games are getting DHB stakes.
--
-- King's Gambit is a LADDER, and it gets no table here. Ratings are derived
-- from the matches themselves by `chess_ladder()` below — a stored rating
-- column would be a second source of truth that drifts the first time a
-- settlement retries, and the matches are the truth.

create table public.arcade_scores (
  -- Registry slug, e.g. 'street-slayer'. Text rather than an enum: adding a
  -- game must not need a migration, and an unknown slug here is inert — the
  -- edge function refuses to write one and nothing reads one.
  game text not null,
  wallet text not null,

  -- The single ranked number, and the ONLY thing the ordering looks at. It is
  -- composed by the edge function so that "further" always beats "faster" (see
  -- the score note there); `detail` carries the parts it was built from so the
  -- board can render a run rather than an integer.
  score bigint not null check (score > 0),
  detail jsonb not null default '{}'::jsonb,

  -- How many runs this wallet has ever submitted, not how many are on the
  -- board — the row itself is the one best run. Worth showing: "best of 40
  -- runs" and "best of 1" are different achievements.
  runs integer not null default 1 check (runs > 0),

  -- When the BEST run happened, not when the row was last touched. Ties are
  -- broken by it, so it moves only when the score does.
  achieved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (game, wallet)
);

-- The board query, exactly: one game, best first, tie broken by who got there
-- first. Matching that ORDER BY means the top N never sorts.
create index arcade_scores_board_idx
  on public.arcade_scores (game, score desc, achieved_at asc);

alter table public.arcade_scores enable row level security;

-- Public reads: a leaderboard nobody can read is not a leaderboard. No insert,
-- update or delete policy exists — the edge function bypasses RLS with the
-- service role, clients cannot write here at all.
create policy "arcade_scores_public_read"
  on public.arcade_scores for select using (true);

-- ------------------------------------------------------------- the run ledger

-- One row per attempt, and the thing that makes the run board worth having.
--
-- A single-player game on somebody else's machine can always lie about its
-- result. What it cannot do is fabricate elapsed time on OUR clock. So a run is
-- opened here before it is played, the game reports its progress as it goes,
-- and every report is accrued against `started_at`: progress is credited at
-- most as fast as a person could physically have earned it, is monotone, and is
-- read back off this table at the end rather than out of the closing message.
-- The score is composed from what this table saw, never from what the last
-- request claimed.
--
-- The honest limit: a scripted attacker who is willing to spend the real
-- minutes and make the real calls can still place one fabricated run. What this
-- costs them is that it takes as long as playing, it is rate limited, and it is
-- one row per attempt with the anomalies written down. Anything that pays out
-- money is settled from a refereed match or from the chain — never from here.
create table public.arcade_runs (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  wallet text not null,

  status text not null default 'live'
    check (status in ('live', 'scored')),

  -- SERVER-OBSERVED progress, in permille of the reachable street, and the
  -- game-specific secondary (Street Slayer: hit points left). Both are what
  -- this function credited, not what any client asked for.
  progress integer not null default 0 check (progress between 0 and 1000),
  life integer not null default 0 check (life >= 0),

  -- How many reports arrived. A run that reached the end of the street in one
  -- report is a different animal from one that walked there.
  checkpoints integer not null default 0,

  -- Anomalies, appended as they are seen: a claim ahead of the clock, health
  -- that went up further than the game can give it. Never shown to a client —
  -- the point is to be able to look, later, at what a suspect board looks like.
  flags text[] not null default '{}',

  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  scored_at timestamptz
);

-- Two lookups: "this player's recent runs" for review, and the live-run sweep.
create index arcade_runs_wallet_idx on public.arcade_runs (wallet, started_at desc);
create index arcade_runs_live_idx on public.arcade_runs (started_at) where status = 'live';

alter table public.arcade_runs enable row level security;
-- Deliberately NO policies, not even select. This is the anti-cheat ledger:
-- only the service role touches it, and telling a client which of its runs got
-- flagged is telling a cheat exactly which lie to stop telling.

-- ---------------------------------------------------------------- the ladder

-- Elo over every finished online match, replayed in order.
--
-- WHY ELO AND NOT POINTS
-- ----------------------
-- Wallets are free. On a points ladder (3 for a win, 1 for a draw) a player
-- can make a second wallet, beat it a hundred times and buy the top of the
-- board for the price of an hour. Elo prices that out by construction: beating
-- an opponent you have already beaten into the floor is worth almost nothing,
-- so a farmed alt converges to zero gain after a dozen games. That property is
-- the reason for the choice, not tradition.
--
-- WHY DERIVED AND NOT STORED
-- --------------------------
-- The referee (`chess-match`) could write a rating as it settles a match, and
-- then a retried settlement or a hand-repaired row would silently mean the
-- ladder no longer matches the games it claims to count. Deriving costs one
-- pass over a small table and cannot drift. If chess_matches ever outgrows
-- that, this becomes a table refreshed on a cron and the signature stays.
--
-- `security invoker` so the replay reads chess_matches under the caller's own
-- RLS (public select), and this can never become a wider window than the table.
create or replace function public.chess_ladder(p_limit integer default 100)
returns table (
  wallet text,
  rating integer,
  played integer,
  wins integer,
  losses integer,
  draws integer,
  last_played timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  m  record;
  -- wallet -> {r: rating, n: games, w/l/d: record, t: last played}. A jsonb map
  -- rather than a temp table because a STABLE function must not write, and the
  -- map is a few hundred keys at most.
  st jsonb := '{}'::jsonb;
  a  jsonb;
  b  jsonb;
  ra numeric;
  rb numeric;
  ea numeric;   -- white's expected score
  sa numeric;   -- white's actual score
  ka numeric;
  kb numeric;
begin
  for m in
    select
      white_wallet as wa,
      black_wallet as wb,
      winner,
      coalesce(finished_at, created_at) as at
    from public.chess_matches
    where status = 'finished'
      and white_wallet is not null
      and black_wallet is not null
      -- Nobody rates a game against themselves. It is a no-op on the rating
      -- either way, but it would still inflate the games-played count that the
      -- provisional marker reads.
      and white_wallet <> black_wallet
      -- At least one move from each side. Open, join, resign is two clicks and
      -- no chess; rating it would make the cheapest possible farm the fastest.
      and ply >= 2
    -- id as the second key so two matches settled in the same millisecond
    -- replay in a stable order — otherwise the same data can produce two
    -- different ladders.
    order by coalesce(finished_at, created_at), id
  loop
    a := coalesce(st -> m.wa, jsonb_build_object('r', 1200, 'n', 0, 'w', 0, 'l', 0, 'd', 0));
    b := coalesce(st -> m.wb, jsonb_build_object('r', 1200, 'n', 0, 'w', 0, 'l', 0, 'd', 0));

    ra := (a ->> 'r')::numeric;
    rb := (b ->> 'r')::numeric;
    ea := 1.0 / (1.0 + power(10.0, (rb - ra) / 400.0));
    sa := case when m.winner = 'w' then 1.0 when m.winner = 'b' then 0.0 else 0.5 end;

    -- A newcomer's rating moves fast so they reach their real level in a few
    -- games instead of thirty; it settles once the ladder knows them.
    ka := case when (a ->> 'n')::integer < 10 then 40.0 else 20.0 end;
    kb := case when (b ->> 'n')::integer < 10 then 40.0 else 20.0 end;

    st := st
      || jsonb_build_object(m.wa, jsonb_build_object(
           'r', ra + ka * (sa - ea),
           'n', (a ->> 'n')::integer + 1,
           'w', (a ->> 'w')::integer + (case when m.winner = 'w' then 1 else 0 end),
           'l', (a ->> 'l')::integer + (case when m.winner = 'b' then 1 else 0 end),
           'd', (a ->> 'd')::integer + (case when m.winner is null then 1 else 0 end),
           't', m.at))
      || jsonb_build_object(m.wb, jsonb_build_object(
           'r', rb + kb * ((1.0 - sa) - (1.0 - ea)),
           'n', (b ->> 'n')::integer + 1,
           'w', (b ->> 'w')::integer + (case when m.winner = 'b' then 1 else 0 end),
           'l', (b ->> 'l')::integer + (case when m.winner = 'w' then 1 else 0 end),
           'd', (b ->> 'd')::integer + (case when m.winner is null then 1 else 0 end),
           't', m.at));
  end loop;

  -- Positional ORDER BY: the RETURNS TABLE columns are PL/pgSQL variables in
  -- here, so naming them in the query would be ambiguous rather than helpful.
  return query
    select
      e.k,
      round((e.v ->> 'r')::numeric)::integer,
      (e.v ->> 'n')::integer,
      (e.v ->> 'w')::integer,
      (e.v ->> 'l')::integer,
      (e.v ->> 'd')::integer,
      (e.v ->> 't')::timestamptz
    from jsonb_each(st) as e(k, v)
    order by 2 desc, 3 desc, 1
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;
