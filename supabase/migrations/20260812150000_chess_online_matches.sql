-- Online chess for the arcade's King's Gambit.
--
-- Two tables, and a deliberate write model: NOBODY writes them from the
-- client. Every insert and update goes through the chess-match edge function
-- with the service role, because a move is only a move once the server has
-- validated it against the live position — with DHB stakes coming to these
-- games later, a client-writable board would be a client-writable balance.
-- Reads are open: a chess game is a public thing, and spectating is a
-- feature, not a leak.
--
-- Clients learn about the other side's moves over Realtime, as
-- postgres_changes on these tables — hence the publication lines at the
-- bottom. No broadcast topics: TikUp's audit showed what authorization-free
-- broadcast means for anything that matters.

create table public.chess_matches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open'
    check (status in ('open', 'active', 'finished', 'cancelled')),

  -- Players, lowercase wallets. created_by opens the challenge; opponent
  -- lands on join, which is also when the coin flip assigns the colours.
  created_by text not null,
  opponent text,
  white_wallet text,
  black_wallet text,

  -- Terms, fixed at creation. stake_dhb is carried from day one so the
  -- wagering release is additive, but the function refuses non-zero stakes
  -- until the escrow ledger work ships — the column existing is not the
  -- feature existing.
  stake_dhb numeric not null default 0 check (stake_dhb >= 0),
  clock_initial_ms bigint not null,
  -- Null means the standard start; the house variant opens from the
  -- King's Gambit accepted position.
  start_fen text,

  -- The live position. fen is the one source of truth the server validates
  -- against; ply is the optimistic lock every move update is conditioned on.
  fen text not null,
  turn text not null default 'w' check (turn in ('w', 'b')),
  ply integer not null default 0,

  -- Remaining time per side AS OF last_move_at. The side to move is burning
  -- theirs; the server settles the difference when the move (or the timeout
  -- claim) arrives. Nothing ticks in the database.
  white_ms bigint,
  black_ms bigint,
  last_move_at timestamptz,

  winner text check (winner in ('w', 'b')),
  end_reason text,

  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- The lobby: open challenges, newest first.
create index chess_matches_open_idx
  on public.chess_matches (created_at desc)
  where status = 'open';

-- "Your matches", either seat.
create index chess_matches_creator_idx on public.chess_matches (created_by);
create index chess_matches_opponent_idx on public.chess_matches (opponent);

create table public.chess_moves (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.chess_matches (id) on delete cascade,
  -- 0-based half-move index; unique per match so a double-submitted move is
  -- a constraint error rather than a duplicated ply.
  ply integer not null,
  wallet text not null,
  from_sq text not null,
  to_sq text not null,
  promotion text,
  san text not null,
  fen_after text not null,
  -- Both clocks as the server settled them on this move, so a client that
  -- missed a beat can rebuild the clock from the latest row alone.
  white_ms bigint,
  black_ms bigint,
  created_at timestamptz not null default now(),
  unique (match_id, ply)
);

create index chess_moves_match_idx on public.chess_moves (match_id, ply);

alter table public.chess_matches enable row level security;
alter table public.chess_moves enable row level security;

-- Public reads, service-role-only writes (no insert/update/delete policies
-- at all: the edge function bypasses RLS, clients cannot).
create policy "chess_matches_public_read"
  on public.chess_matches for select using (true);
create policy "chess_moves_public_read"
  on public.chess_moves for select using (true);

alter publication supabase_realtime add table public.chess_matches;
alter publication supabase_realtime add table public.chess_moves;
