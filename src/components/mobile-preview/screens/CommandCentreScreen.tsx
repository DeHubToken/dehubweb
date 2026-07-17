import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { TrendingUp, DollarSign, Activity, ArrowUpRight } from 'lucide-react';

export function CommandCentreScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title="Command Centre" showAvatar={false} />

      {/* Balance */}
      <div className="mx-4 my-3 p-4 rounded-2xl border border-white/[0.1] bg-white/[0.03]">
        <p className="text-zinc-500 text-xs mb-1">Portfolio Value</p>
        <h2 className="text-white text-2xl font-bold">$3,445.00</h2>
        <div className="flex items-center gap-1 mt-1">
          <TrendingUp className="w-3 h-3 text-white" />
          <span className="text-xs text-zinc-300">+5.2% today</span>
        </div>
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 gap-2 mx-4 mb-4">
        {[
          { label: 'Income (30d)', value: '$842', icon: DollarSign, trend: '+12%' },
          { label: 'Tips Received', value: '1,240 DHB', icon: ArrowUpRight, trend: '+8%' },
          { label: 'Subscribers', value: '2,431', icon: Activity, trend: '+15%' },
          { label: 'Content Views', value: '45.2K', icon: TrendingUp, trend: '+22%' },
        ].map((stat) => (
          <div key={stat.label} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center justify-between mb-2">
              <stat.icon className="w-4 h-4 text-zinc-400" />
              <span className="text-[10px] text-zinc-400">{stat.trend}</span>
            </div>
            <p className="text-white text-base font-bold">{stat.value}</p>
            <p className="text-zinc-600 text-[10px]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Mini chart placeholder */}
      <div className="mx-4 mb-4 p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white text-sm font-semibold">Income Chart</h3>
          <span className="text-zinc-500 text-xs">30 days</span>
        </div>
        <div className="h-32 flex items-end gap-1">
          {[40, 55, 35, 65, 50, 80, 60, 90, 70, 85, 95, 75].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-white/[0.08] rounded-t"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="px-4 flex-1">
        <h3 className="text-white text-sm font-semibold mb-3">Recent Transactions</h3>
        <div className="space-y-2">
          {[
            { type: 'Tip received', amount: '+50 DHB', from: 'bob_dev', time: '2h ago' },
            { type: 'Subscription', amount: '+100 DHB', from: 'crypto_sarah', time: '5h ago' },
            { type: 'Withdrawal', amount: '-500 DHB', from: 'To wallet', time: '1d ago' },
          ].map((tx, i) => (
            <div key={i} className="flex items-center gap-3 py-2 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                {tx.amount.startsWith('+') ? (
                  <ArrowUpRight className="w-4 h-4 text-white rotate-180" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-zinc-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm block">{tx.type}</span>
                <span className="text-zinc-600 text-[11px]">{tx.from} • {tx.time}</span>
              </div>
              <span className={`text-sm font-medium ${tx.amount.startsWith('+') ? 'text-white' : 'text-zinc-400'}`}>
                {tx.amount}
              </span>
            </div>
          ))}
        </div>
      </div>

      <MobileBottomBar />
    </div>
  );
}
