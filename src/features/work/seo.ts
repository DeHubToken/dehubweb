/**
 * Bounty URL + crawler-facing copy, in one place.
 *
 * The edge worker (CLOUDFLARE_WORKER_SEO.js, buildBountyHtml) renders bot HTML
 * for the same URLs and has to say the same things — it cannot import this
 * file, so it carries a hand-kept copy of these three functions. When the
 * wording here changes, change it there too: bot copy that has drifted from
 * browser copy is what cloaking looks like from the outside, and /music,
 * /jobs, /bridge, /glossary and /top-100 all drifted that way before anyone
 * noticed.
 */
import type { WorkJob } from './types';

/** Canonical path for a bounty. `/work/<uuid>` is the legacy form. */
export function bountyPath(job: Pick<WorkJob, 'job_number'>): string {
  return `/bounty/${job.job_number}`;
}

export function bountyUrl(job: Pick<WorkJob, 'job_number'>): string {
  return `https://dehub.io${bountyPath(job)}`;
}

export function bountyTitle(job: Pick<WorkJob, 'title'>): string {
  return `${job.title} — DeHub Bounties`;
}

/**
 * A bounty with no description still deserves a sentence: the budget and the
 * kind of work are the two facts a share card has to carry, and "Open bounty
 * on DeHub." on its own reads as a broken page.
 */
export function bountyDescription(
  job: Pick<WorkJob, 'description' | 'total_budget' | 'currency' | 'job_type'>,
): string {
  // 'en-US' pinned, not the visitor's locale: the edge worker renders the same
  // sentence for crawlers and cannot know a locale, so a browser-locale number
  // here would make the two copies differ on a machine set to de-DE.
  const budget = Number(job.total_budget).toLocaleString('en-US', { maximumFractionDigits: 4 });
  const raw =
    job.description ||
    `A ${job.job_type} bounty on DeHub paying ${budget} ${job.currency}. Claim it, submit your proof and get paid from escrow.`;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

/**
 * Which bounties belong in Google's index. A live bounty is a real page
 * somebody can act on; a finished, cancelled or expired one is a dead listing,
 * and nine of those would be nine thin pages competing with /work itself.
 *
 * `noindex` is not "do not render" — a terminal bounty still gets full OG tags
 * so that a link somebody deliberately pastes into a chat unfurls properly.
 */
export function isBountyIndexable(job: Pick<WorkJob, 'status'>): boolean {
  return job.status === 'open' || job.status === 'in_progress';
}
