/**
 * A bounty is addressed three ways and only one of them is canonical:
 * `/bounty/<job_number>` is the real URL, `/work/<uuid>` is the pre-numbers
 * form kept alive for links already shared, and the row's uuid is still the
 * primary key every child table points at.
 *
 * Three things hold that together and none of them are visible to the
 * compiler — they are string tables in a worker, a route list, and a copy of
 * the SPA's own metadata written out by hand at the edge. Each has already
 * failed silently once elsewhere in this file's neighbourhood, so each is
 * asserted here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESERVED_USERNAMES } from '@/lib/reserved-usernames';
import { bountyPath, bountyUrl, bountyTitle } from '@/features/work/seo';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const APP_TSX = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');
const SEO_TS = readFileSync(resolve(ROOT, 'src/features/work/seo.ts'), 'utf8');
const SRC_FILES = ['src/features/work/components/JobCard.tsx', 'src/pages/app/WorkJobDetailPage.tsx',
  'src/pages/app/WorkEditPage.tsx', 'src/pages/app/WorkPostPage.tsx'];

describe('bounty URLs', () => {
  it('builds the canonical shape', () => {
    expect(bountyPath({ job_number: 7 })).toBe('/bounty/7');
    expect(bountyUrl({ job_number: 7 })).toBe('https://dehub.io/bounty/7');
  });

  it('reserves `bounty` so no account can shadow the route', () => {
    expect(RESERVED_USERNAMES.has('bounty')).toBe(true);
  });

  it('routes /bounty/:jobKey in the SPA and keeps /work/:jobKey redirecting', () => {
    expect(APP_TSX).toContain('path="/bounty/:jobKey"');
    expect(APP_TSX).toContain('BountyLegacyRedirect');
  });

  /**
   * The one that has bitten before: every per-entity renderer sits behind
   * shouldServeSSR, which fails closed. `bounty` is a reserved ROUTE_SEGMENT,
   * so the profile fall-through rejects it and without an explicit rule the
   * renderer below is never reached — a share link that unfurls as the
   * homepage, indistinguishable from having no renderer at all. Stages shipped
   * broken for exactly this reason and nobody noticed for months.
   */
  it('lets /bounty/<n> past the SSR gate', () => {
    const gate = WORKER.slice(
      WORKER.indexOf('function shouldServeSSR'),
      WORKER.indexOf('function shouldServeSSR') + 3000,
    );
    expect(gate).toContain(String.raw`/^\/bounty\/\d+\/?$/`);
  });

  it('renders bounties at the edge rather than proxying them', () => {
    expect(WORKER).toContain('function buildBountyHtml');
    expect(WORKER).toMatch(/work_jobs\?job_number=eq\./);
  });

  it('301s the legacy /work/<uuid> space onto the number', () => {
    expect(WORKER).toContain(String.raw`\/work\/([0-9a-fA-F-]{16,})`);
    expect(WORKER).toContain('`${APP_URL}/bounty/${job.job_number}${legacyBounty[2]');
  });

  it('sitemaps only live bounties', () => {
    expect(WORKER).toContain('/sitemap-bounties.xml');
    expect(WORKER).toMatch(/work_jobs\?status=in\.\(open,in_progress\)/);
  });

  /**
   * Bot copy and browser copy describe the same URL, so they have to say the
   * same thing. /music, /jobs, /bridge, /glossary and /top-100 all drifted
   * apart unnoticed — the shape of a cloaking complaint.
   */
  it('keeps the worker`s bounty copy in step with the SPA`s', () => {
    expect(bountyTitle({ title: 'Widget' })).toBe('Widget — DeHub Bounties');
    expect(WORKER).toContain('const title = `${name} — DeHub Bounties`;');
    // The fallback sentence for a description-less bounty, verbatim in both.
    const fallback = 'bounty on DeHub paying ${budget} ${job.currency}. Claim it, submit your proof and get paid from escrow.';
    expect(WORKER).toContain(fallback);
    expect(SEO_TS).toContain('bounty on DeHub paying ${budget} ${job.currency}. Claim it, submit your proof and get paid from escrow.');
    // Both format the budget in a fixed locale, or a de-DE browser disagrees
    // with the edge about where the decimal point goes.
    expect(SEO_TS).toContain("toLocaleString('en-US'");
    expect(WORKER).toContain("toLocaleString('en-US'");
  });

  it('has no /work/<id> links left in the app', () => {
    for (const file of SRC_FILES) {
      expect(readFileSync(resolve(ROOT, file), 'utf8')).not.toMatch(/\/work\/\$\{[^}]*\bid\b/);
    }
  });
});
