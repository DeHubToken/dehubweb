-- Tell a decision apart from a derivation.
--
-- Applied 2026-09-05.
--
-- `transcribe` writes a transcript's visibility on every pass — pending while
-- the media transcodes, again when it is reachable, again per retry, again on a
-- force. For a post that value is derived from the post, which is right: a post
-- that goes paid should pull its transcript along. For a stage there is nothing
-- to derive it from, so the resolver answers the constant 'public', and an
-- admin who locked a stage transcript watched the next sweeper pass publish it
-- again.
--
-- 20260902120000's fix for that was a ratchet: never write a looser value than
-- the row already carries. It closed the bug and opened a smaller one, because
-- it cannot tell WHY a row is restricted. A post that goes from paid back to
-- free keeps a private transcript for good, and only the admin panel can undo
-- it — a one-way door with nothing behind it.
--
-- The missing fact is who set the value. A human decision should stick in both
-- directions; a value derived from the post should follow the post in both
-- directions. One boolean says which it was.

alter table public.transcripts
  add column if not exists visibility_locked boolean not null default false;

comment on column public.transcripts.visibility_locked is
  'True when a person set this transcript''s visibility. The transcriber leaves a locked row''s visibility alone, in both directions; an unlocked row follows whatever its source says.';

-- Existing rows are unlocked: nothing that has run so far recorded a decision,
-- and treating them all as locked would freeze every transcript on the value
-- the ratchet happened to leave it at.
