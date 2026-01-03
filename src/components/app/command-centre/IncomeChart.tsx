import { Info, Settings2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useState } from 'react';

const data = [
  { name: 'Subscriptions', value: 47, color: '#22c55e' },
  { name: 'Deposits', value: 35, color: '#ef4444' },
  { name: 'Tips', value: 29, color: '#eab308' },
];

const timeFilters = ['1h', '1d', '1w', '1m', 'Max'];

export function IncomeChart() {
  const [activeFilter, setActiveFilter] = useState('1m');

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-zinc-400 text-sm">Income chart</span>
          <p className="text-zinc-500 text-xs mt-1">
            Top source of income <span className="text-white">141,727.98 DeHub</span> came from
          </p>
          <p className="text-emerald-400 text-sm font-medium">Subscriptions</p>
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
      <div className="flex items-center gap-1 mb-4 bg-zinc-800/50 rounded-full p-1 w-fit ml-auto">
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

      {/* Donut Chart */}
      <div className="flex items-center justify-center">
        <div className="relative w-48 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          
          {/* Legend overlays */}
          <div className="absolute top-2 left-0 text-xs text-yellow-400">29% Tips</div>
          <div className="absolute top-2 right-0 text-xs text-red-400">35% Deposits</div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-emerald-400">47% Subscriptions</div>
        </div>
      </div>
    </div>
  );
}
