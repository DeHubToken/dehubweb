import { Link } from 'react-router-dom';
import { Briefcase, Eye, Users, Coins, Clock } from 'lucide-react';
import type { WorkJob } from '../types';

const TYPE_LABEL: Record<string, string> = {
  shill: 'Comment / Shill',
  clipping: 'Clipping',
  contract: 'Contract',
};

export function JobCard({ job }: { job: WorkJob }) {
  const isBoosted = job.boost_expires_at && new Date(job.boost_expires_at) > new Date();
  return (
    <Link
      to={`/work/${job.id}`}
      className="block bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/80 inline-flex items-center gap-1">
            <Briefcase className="w-3 h-3" /> {TYPE_LABEL[job.job_type]}
          </span>
          {job.platform && (
            <span className="px-2 py-0.5 rounded-md bg-white/5 text-white/60 uppercase">{job.platform}</span>
          )}
          {isBoosted && <span className="px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-200">Boosted</span>}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-white tabular-nums">
            {job.total_budget.toLocaleString(undefined, { maximumFractionDigits: 2 })} {job.currency}
          </div>
          {job.job_type !== 'contract' && (
            <div className="text-[11px] text-white/50">
              {job.price_per_unit} {job.currency}/{job.job_type === 'clipping' ? '1k views' : 'task'}
            </div>
          )}
        </div>
      </div>

      <h3 className="text-base font-semibold text-white line-clamp-1 mb-1">{job.title}</h3>
      <p className="text-sm text-white/60 line-clamp-2 mb-4">{job.description}</p>

      <div className="flex items-center gap-4 text-xs text-white/50">
        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{job.application_count} apps</span>
        <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{job.submission_count} subs</span>
        <span className="inline-flex items-center gap-1"><Coins className="w-3.5 h-3.5" />{job.units_approved}/{job.max_units}</span>
        {job.deadline && (
          <span className="inline-flex items-center gap-1 ml-auto"><Clock className="w-3.5 h-3.5" />
            {new Date(job.deadline).toLocaleDateString()}
          </span>
        )}
      </div>
    </Link>
  );
}
