import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Briefcase, Scissors, MessageSquare, Search } from 'lucide-react';
import { useBrowseJobs } from '@/features/work/hooks/use-work';
import { JobCard } from '@/features/work/components/JobCard';
import type { WorkJobType, WorkCurrency } from '@/features/work/types';
import { SEOHead } from '@/components/SEOHead';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';


const TABS: Array<{ id: WorkJobType | 'all'; label: string; icon: any }> = [
  { id: 'all', label: 'All', icon: Briefcase },
  { id: 'shill', label: 'Social Media', icon: MessageSquare },
  { id: 'clipping', label: 'Clipping', icon: Scissors },
  { id: 'contract', label: 'Contracts', icon: Briefcase },
];

export default function WorkPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<WorkJobType | 'all'>('all');
  const [currency, setCurrency] = useState<WorkCurrency | 'all'>('all');
  const [sort, setSort] = useState<'newest' | 'highest_pay' | 'ending_soon'>('newest');
  const [search, setSearch] = useState('');

  const { data: jobs = [], isLoading } = useBrowseJobs({
    job_type: tab,
    currency,
    sort,
    search: search.trim() || undefined,
  });

  // Swallow the job list at the sticky header bento's top edge under the glass
  // themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <div className="min-h-screen">
      <SEOHead title="Work — Paid Jobs, Clipping & Contracts | DeHub" description="Browse paid jobs on DeHub: comments & shill work, clipping bounties, and fixed-price contracts. Get paid in DHB or USDC." url="https://dehub.io/work" />
      {/* Sticky nav pill */}
      <div data-feed-nav-outer className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2 max-w-6xl mx-auto">
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3 space-y-3">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white">Work</h1>
              <p className="text-sm text-white/60">Post jobs, complete bounties, get paid in DHB or USDC.</p>
            </div>
            <LiquidGlassBubble2
              label="Post a Job"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => navigate('/work/post')}
              width="auto"
              height="44px"
              className="[&>div]:!rounded-2xl"
            />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-colors ${
                    active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs…"
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30"
              />
            </div>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
            >
              <option value="all">All currencies</option>
              <option value="DHB">DHB</option>
              <option value="USDC">USDC</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
            >
              <option value="newest">Newest</option>
              <option value="highest_pay">Highest pay</option>
              <option value="ending_soon">Ending soon</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div ref={contentRef} className="max-w-6xl mx-auto px-2 sm:px-3 pt-3 pb-6">
        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 text-white/50">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="mb-4">No jobs yet — be the first to post one.</p>
            <LiquidGlassBubble2
              label="Post a Job"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => navigate('/work/post')}
              width="auto"
              height="40px"
              className="[&>div]:!rounded-xl"
            />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {jobs.map((j) => <JobCard key={j.id} job={j} />)}
          </div>
        )}
      </div>
    </div>
  );
}
