import { TrendingUp, Info, Settings2, Coins } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { useState } from 'react';

const chartData = [
  { month: 'Jan', balance: 45000 },
  { month: 'Feb', balance: 52000 },
  { month: 'Mar', balance: 67567, label: true },
  { month: 'Apr', balance: 58000 },
  { month: 'May', balance: 72000 },
  { month: 'Jun', balance: 85000 },
];

const timeFilters = ['1h', '1d', '1w', '1m', 'Max'];

export function BalanceCard() {
  const [activeFilter, setActiveFilter] = useState('1m');

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-zinc-400 text-sm">Total balance</span>
            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Increased by 27%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-3xl sm:text-4xl font-bold text-white">128,990,890</span>
            <Coins className="w-5 h-5 text-yellow-500" />
          </div>
          <p className="text-zinc-500 text-sm mt-1">You gained <span className="text-white">345,678 DeHub</span> last month.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-zinc-500 hover:text-zinc-300">
            <Info className="w-4 h-4" />
          </button>
          <button className="text-zinc-500 hover:text-zinc-300">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Time Filters */}
      <div className="flex items-center gap-1 mb-4 bg-zinc-800/50 rounded-full p-1 w-fit">
        {timeFilters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              activeFilter === filter
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="month" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#71717a', fontSize: 11 }}
            />
            <YAxis 
              hide 
              domain={['dataMin - 10000', 'dataMax + 10000']}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#18181b', 
                border: '1px solid #27272a',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value: number) => [`${value.toLocaleString()} DeHub`, 'Balance']}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#balanceGradient)"
              dot={(props) => {
                const { cx, cy, payload } = props;
                if (payload.label) {
                  return (
                    <g key={`dot-${payload.month}`}>
                      <circle cx={cx} cy={cy} r={4} fill="#10b981" />
                      <rect x={cx - 45} y={cy - 35} width={90} height={24} rx={4} fill="#27272a" />
                      <text x={cx} y={cy - 20} textAnchor="middle" fill="#fff" fontSize={10}>
                        Mar 08 • +15.98%
                      </text>
                      <text x={cx} y={cy - 8} textAnchor="middle" fill="#10b981" fontSize={10}>
                        67,567 DeHub
                      </text>
                    </g>
                  );
                }
                return null;
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
