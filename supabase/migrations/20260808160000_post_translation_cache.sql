-- Persistent translation cache
-- ============================
-- translate-text has only ever cached in a module-level Map capped at 500
-- entries. That map lives inside one edge isolate: it is not shared with the
-- other isolates serving the same traffic, and it is gone on the next cold
-- start. For the opt-in translate button that was tolerable — a miss costs one
-- Gemini call and the user asked for it.
--
-- It stops being tolerable the moment the feed translates itself. Auto-translate
-- turns the cost from "per post somebody chose to translate" into "per post, per
-- viewer, per isolate that has not seen it yet", so a post doing numbers in one
-- language gets re-translated over and over for the same text. Nothing about the
-- translation is per-viewer, so none of that repetition buys anything.
--
-- Keying on a hash of the body rather than a post id is deliberate. The same
-- text reposted, quoted, or duplicated across accounts is the same translation,
-- and a body that gets edited should miss rather than serve the old text — both
-- fall out of hashing the content. It also means comments, bios and any other
-- surface can share one cache with posts.
--
-- sha256 over the full body, not a prefix: the in-memory key already had to be
-- widened once after two 32-bit hashes over the first 200 characters let
-- templated bodies collide and hand one caller another caller's translation. A
-- shared table makes that failure permanent rather than isolate-lifetime, so it
-- gets a real digest.

create table if not exists public.post_translations (
  text_hash       text        not null,
  target_lang     text        not null,
  translated_text text        not null,
  source_lang     text,
  provider        text        not null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz not null default now(),
  hit_count       integer     not null default 0,
  primary key (text_hash, target_lang)
);

comment on table public.post_translations is
  'Content-addressed translation cache shared by every translate-text caller. Written only by the service role.';
comment on column public.post_translations.text_hash is
  'sha256 hex of the full source text, lowercased hex, no truncation.';
comment on column public.post_translations.provider is
  'Which upstream produced this row (mymemory | gemini), so a bad provider''s output can be evicted selectively.';

-- Eviction and cost reporting both want "what has not been read lately".
create index if not exists post_translations_last_used_idx
  on public.post_translations (last_used_at);

-- Rows are public translations of public content, but nothing outside the edge
-- function has any reason to read or write them directly, and this table is a
-- cache the function trusts. RLS on with no policies denies anon and
-- authenticated outright; the service role bypasses RLS and stays the only
-- writer. Note the wallet-header policies used elsewhere in this schema are not
-- an option here — they authenticate on an unsigned header.
alter table public.post_translations enable row level security;

-- Bumping the read counters through the REST API would need a read-then-write
-- round trip, and two isolates serving the same cached post would lose counts to
-- each other. One statement, incremented in place, and the caller does not wait
-- on it.
create or replace function public.touch_post_translation(
  p_text_hash text,
  p_target_lang text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.post_translations
     set hit_count = hit_count + 1,
         last_used_at = now()
   where text_hash = p_text_hash
     and target_lang = p_target_lang;
$$;

revoke all on function public.touch_post_translation(text, text) from public, anon, authenticated;
