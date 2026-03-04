import { MobileStatusBar } from '../MobileStatusBar';
import { ChevronLeft, Lock, Unlock, TrendingUp, Clock, Coins } from 'lucide-react';

const STAKING_OPTIONS = [
  { period: '7 Days', apy: '8.2%', minStake: '100 DHB', locked: '2.4M DHB' },
  { period: '30 Days', apy: '12.4%', minStake: '500 DHB', locked: '8.1M DHB' },
  { period: '90 Days', apy: '18.7%', minStake: '1,000 DHB', locked: '15.3M DHB' },
];

export function StakingScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />

      <div className="flex items-center gap-3 px-4 pt-1 pb-3">
        <ChevronLeft className="w-5 h-5 text-white" />
        <h1 className="text-white text-lg font-bold">Staking</h1>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-2 gap-2 mx-4 mb-4">
        {[
          { icon: Coins, label: 'Total Staked', value: '25.8M DHB' },
          { icon: TrendingUp, label: 'Avg APY', value: '12.4%' },
          { icon: Lock, label: 'Your Staked', value: '10,000 DHB' },
          { icon: Clock, label: 'Lock Remaining', value: '23 days' },
        ].map((stat) => (
          <div key={stat.label} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <stat.icon className="w-4 h-4 text-zinc-400 mb-1.5" />
            <p className="text-zinc-500 text-[10px]">{stat.label}</p>
            <p className="text-white text-sm font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Your position */}
      <div className="mx-4 mb-4 p-4 rounded-2xl border border-white/[0.1] bg-white/[0.03]">
        <h3 className="text-white text-sm font-semibold mb-3">Your Position</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-zinc-500 text-sm">Staked Amount</span>
            <span className="text-white text-sm font-medium">10,000 DHB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 text-sm">Lock Period</span>
            <span className="text-white text-sm font-medium">90 Days</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 text-sm">Earned Rewards</span>
            <span className="text-white text-sm font-medium">+461 DHB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 text-sm">Current APY</span>
            <span className="text-white text-sm font-medium">18.7%</span>
          </div>
        </div>
        <button className="w-full mt-4 h-10 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-medium">
          Claim Rewards
        </button>
      </div>

      {/* Staking options */}
      <div className="px-4 flex-1">
        <h3 className="text-white text-sm font-semibold mb-3">Staking Options</h3>
        <div className="space-y-2">
          {STAKING_OPTIONS.map((opt) => (
            <div key={opt.period} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                <Lock className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <span className="text-white text-sm font-medium block">{opt.period}</span>
                <span className="text-zinc-600 text-[11px]">Min: {opt.minStake}</span>
              </div>
              <div className="text-right">
                <span className="text-white text-sm font-bold block">{opt.apy}</span>
                <span className="text-zinc-600 text-[10px]">{opt.locked} locked</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
