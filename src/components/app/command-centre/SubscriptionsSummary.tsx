import { TrendingUp, Info, Settings2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import dehubCoin from '@/assets/dehub-coin.png';

const tierData = [
  { tier: 'Active subscribers', count: 72, active: true },
  { tier: 'Tier 1 subscribers', count: 25 },
  { tier: 'Tier 2 subscribers', count: 36 },
  { tier: 'Tier 3 subscribers', count: 8 },
  { tier: 'Tier 4 subscribers', count: 6 },
];

export function SubscriptionsSummary() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Subscriptions</h3>
        <Button variant="glass" size="sm" className="text-xs h-8 rounded-xl">
          View Details
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button className="bg-zinc-800 text-white text-xs px-3 py-1.5 rounded-xl">
          Your subscribers
        </button>
        <button className="text-zinc-500 text-xs px-3 py-1.5 rounded-xl hover:text-white">
          Your subscriptions
        </button>
      </div>

      {/* Revenue Card */}
      <div className="bg-zinc-800/50 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400 text-sm">Projected monthly revenue</span>
          <div className="flex items-center gap-2">
            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-lg flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Increased by 17%
            </span>
            <Info className="w-4 h-4 text-zinc-500" />
            <Settings2 className="w-4 h-4 text-zinc-500" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-emerald-400">169,009</span>
          <img src={dehubCoin} alt="DeHub" className="w-5 h-5" />
        </div>
        <p className="text-zinc-500 text-sm mt-1">You generated <span className="text-white">140,277.47 DeHub</span> last month.</p>
      </div>

      {/* Tier Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {tierData.map((tier, index) => (
          <div 
            key={index} 
            className={`rounded-xl p-3 ${
              tier.active 
                ? 'bg-zinc-800 col-span-3 sm:col-span-1' 
                : 'bg-zinc-800/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-zinc-500 text-xs">{tier.tier}</span>
              {tier.active && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="text-white text-xl font-bold">{tier.count}</span>
          </div>
        ))}
      </div>

      {/* Popular Tier */}
      <div className="text-zinc-500 text-sm">
        Your most popular tier is <span className="text-emerald-400 font-medium">Tier 2</span> projected to generate <span className="text-emerald-400 font-medium">84,504 DeHub</span>.
      </div>
    </div>
  );
}
