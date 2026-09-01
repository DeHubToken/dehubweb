/**
 * Bounty Link Embed
 * =================
 * Detects bounty URLs (/bounty/<job_number>, and the legacy /work/<uuid>) and
 * renders them as rich preview cards — the same treatment stores and events
 * already get. `useWorkJob` resolves either key shape on its own.
 */

import { useNavigate } from 'react-router-dom';
import { Briefcase, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { ReactNode } from 'react';
import { useWorkJob } from '@/features/work/hooks/use-work';
import { useTokenPrices } from '@/hooks/use-token-prices';
import dehubCoin from '@/assets/dehub-coin.png';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

interface BountyLinkEmbedProps {
  jobKey: string;
  /** The path as written in the source link — preserves /work/<uuid>/edit etc. */
  path: string;
  fallback?: ReactNode;
}

export function BountyLinkEmbed({ jobKey, path, fallback = null }: BountyLinkEmbedProps) {
  const navigate = useNavigate();
  const { data: job, isLoading } = useWorkJob(jobKey);
  const { data: prices } = useTokenPrices();

  if (isLoading) {
    return <div className="mt-2 h-20 rounded-xl bg-white/[0.04] animate-pulse" />;
  }
  if (!job) return <>{fallback}</>;

  const dhbPrice = prices?.DHB ?? 0;
  const budget = Number(job.total_budget);
  const budgetDhb = job.currency === 'DHB' ? budget : dhbPrice > 0 ? budget / dhbPrice : 0;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(path);
      }}
      data-no-navigate
      className="w-full flex items-stretch gap-3 p-3 mt-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left overflow-hidden"
    >
      <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
        <Briefcase className="w-5 h-5 text-zinc-500" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <p className="text-sm font-semibold text-white truncate">{job.title}</p>
        <p className="text-xs text-zinc-500 truncate capitalize">
          {STATUS_LABEL[job.status] ?? job.status} bounty · {job.job_type}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-sm font-semibold text-white flex items-center gap-1">
            {job.currency === 'DHB' ? (
              <>
                <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
                {Math.ceil(budgetDhb).toLocaleString()}
              </>
            ) : (
              `$${budget.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`
            )}
          </p>
          {job.deadline && (
            <p className="text-xs text-zinc-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(job.deadline), 'MMM d')}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
