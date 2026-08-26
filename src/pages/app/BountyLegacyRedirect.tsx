import { Navigate, useParams } from 'react-router-dom';
import { useWorkJob } from '@/features/work/hooks/use-work';
import { bountyPath } from '@/features/work/seo';

/**
 * `/work/<uuid>` — the share form bounties had before they had numbers.
 *
 * Those links are already out in the wild, so the old space keeps resolving:
 * look the row up by primary key, then hand over to the canonical
 * `/bounty/<job_number>`. The edge worker 301s the same pair for crawlers
 * (CLOUDFLARE_WORKER_SEO.js), which is what consolidates the ranking signal;
 * this component covers in-app navigation and anyone arriving with the SPA
 * already booted, where no request reaches the worker at all.
 *
 * A uuid that matches no row lands on the board rather than on
 * /bounty/undefined — a deleted bounty should leave you somewhere useful.
 */
export default function BountyLegacyRedirect({ suffix = '' }: { suffix?: string }) {
  const { jobKey } = useParams<{ jobKey: string }>();
  const { data: job, isLoading } = useWorkJob(jobKey);

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 py-10 text-white/60">Loading…</div>;
  if (!job) return <Navigate to="/work" replace />;
  return <Navigate to={`${bountyPath(job)}${suffix}`} replace />;
}
