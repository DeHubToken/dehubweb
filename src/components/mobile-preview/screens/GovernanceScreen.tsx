import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { ThumbsUp, ThumbsDown, MessageSquare, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const MOCK_PROPOSALS = [
  { id: '1', title: 'Treasury Allocation for Q2 Developer Grants', author: 'dao_voter', status: 'active', votesFor: 1240, votesAgainst: 320, comments: 45, timeLeft: '3d 12h' },
  { id: '2', title: 'Implement Cross-Chain Bridge Integration', author: 'web3_dev', status: 'active', votesFor: 890, votesAgainst: 156, comments: 28, timeLeft: '5d 8h' },
  { id: '3', title: 'Community Fund for Creator Onboarding', author: 'alice.eth', status: 'passed', votesFor: 2100, votesAgainst: 450, comments: 67, timeLeft: 'Ended' },
  { id: '4', title: 'Reduce Minimum Stake for Governance Voting', author: 'defi_whale', status: 'rejected', votesFor: 600, votesAgainst: 1800, comments: 92, timeLeft: 'Ended' },
];

const STATUS_MAP = {
  active: { icon: Clock, label: 'Active', classes: 'text-white bg-white/[0.08]' },
  passed: { icon: CheckCircle, label: 'Passed', classes: 'text-zinc-300 bg-white/[0.06]' },
  rejected: { icon: AlertCircle, label: 'Rejected', classes: 'text-zinc-500 bg-white/[0.04]' },
};

export function GovernanceScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title="Governance" />

      {/* Filter */}
      <div className="flex gap-1.5 px-4 py-3">
        {['All', 'Active', 'Passed', 'Rejected'].map((tab, i) => (
          <button
            key={tab}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              i === 0 ? 'bg-white/10 text-white border border-white/20' : 'text-zinc-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="flex gap-2 px-4 pb-4">
        <div className="flex-1 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
          <p className="text-white text-lg font-bold">24</p>
          <p className="text-zinc-600 text-[10px]">Total Proposals</p>
        </div>
        <div className="flex-1 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
          <p className="text-white text-lg font-bold">2</p>
          <p className="text-zinc-600 text-[10px]">Active Now</p>
        </div>
        <div className="flex-1 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
          <p className="text-white text-lg font-bold">8.4K</p>
          <p className="text-zinc-600 text-[10px]">Total Votes</p>
        </div>
      </div>

      {/* Proposals */}
      <div className="px-4 flex-1 space-y-3">
        {MOCK_PROPOSALS.map((proposal) => {
          const status = STATUS_MAP[proposal.status as keyof typeof STATUS_MAP];
          const total = proposal.votesFor + proposal.votesAgainst;
          const forPct = Math.round((proposal.votesFor / total) * 100);
          return (
            <div key={proposal.id} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-1">
                  <h3 className="text-white text-sm font-semibold leading-snug">{proposal.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-zinc-600 text-[11px]">by {proposal.author}</span>
                    <div className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]', status.classes)}>
                      <status.icon className="w-2.5 h-2.5" />
                      {status.label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Vote bar */}
              <div className="h-1.5 rounded-full bg-white/[0.06] mb-2 overflow-hidden">
                <div className="h-full bg-white/30 rounded-full" style={{ width: `${forPct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-400 flex items-center gap-1">
                    <ThumbsUp className="w-3 h-3" /> {proposal.votesFor}
                  </span>
                  <span className="text-zinc-600 flex items-center gap-1">
                    <ThumbsDown className="w-3 h-3" /> {proposal.votesAgainst}
                  </span>
                  <span className="text-zinc-600 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> {proposal.comments}
                  </span>
                </div>
                <span className="text-zinc-600">{proposal.timeLeft}</span>
              </div>
            </div>
          );
        })}
      </div>

      <MobileBottomBar />
    </div>
  );
}
