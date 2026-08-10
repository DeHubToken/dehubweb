import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs build script, no type declarations
import { parseMigration, stripSqlComments } from '../../scripts/check-supabase-drift.mjs';

function parse(sql: string) {
  const r = parseMigration(stripSqlComments(sql));
  return {
    tables: [...r.tables].sort(),
    columns: [...r.columns].sort(),
    dropped: [...r.dropped].sort(),
  };
}

describe('parseMigration', () => {
  it('finds created tables with and without the schema prefix', () => {
    expect(parse(`
      CREATE TABLE public.community_invite_links (id uuid);
      CREATE TABLE IF NOT EXISTS feed_cache (id uuid);
    `).tables).toEqual(['community_invite_links', 'feed_cache']);
  });

  it('finds added columns and attributes them to their table', () => {
    expect(parse(`
      ALTER TABLE public.feature_requests
      ADD COLUMN IF NOT EXISTS image_urls text[];
    `).columns).toEqual(['feature_requests.image_urls']);
  });

  it('carries the table across several ADD COLUMNs in one statement', () => {
    expect(parse(`
      ALTER TABLE public.community_members
        ADD COLUMN IF NOT EXISTS permissions jsonb,
        ADD COLUMN IF NOT EXISTS muted_until timestamptz;
    `).columns).toEqual(['community_members.muted_until', 'community_members.permissions']);
  });

  it('records drops so a retired table is not reported as drift', () => {
    expect(parse('DROP TABLE IF EXISTS public.livechat_messages;').dropped)
      .toEqual(['livechat_messages']);
    expect(parse('ALTER TABLE public.posts DROP COLUMN IF EXISTS legacy_id;').dropped)
      .toEqual(['posts.legacy_id']);
  });

  // The check gates a deploy, so a false alarm is worse than a missed warning.
  it('ignores objects that only appear in comments', () => {
    expect(parse(`
      -- CREATE TABLE public.never_created (id uuid);
      /* ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS ghost text; */
      CREATE TABLE public.real_one (id uuid);
    `)).toEqual({ tables: ['real_one'], columns: [], dropped: [] });
  });

  it('is case insensitive', () => {
    expect(parse('create table public.lower_case (id uuid);').tables).toEqual(['lower_case']);
  });

  it('returns nothing for a data-only migration', () => {
    expect(parse("UPDATE public.feature_requests SET shipped_url = '/app/buy';"))
      .toEqual({ tables: [], columns: [], dropped: [] });
  });
});
