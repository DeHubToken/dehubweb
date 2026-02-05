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
      <div className="flex items-center gap-1 mb-4 bg-zinc-800/50 rounded-xl p-1 w-fit ml-auto">
        {timeFilters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-3 py-1 text-xs rounded-lg transition-colors ${
              activeFilter === filter
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Donut Chart with Legend */}
      <div className="flex items-center justify-center gap-6">
        {/* Legend - Left side */}
        <div className="space-y-3">
          {data.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.color }} 
              />
              <span className="text-sm text-zinc-300">
                <span className="font-medium" style={{ color: item.color }}>{item.value}%</span>
                {' '}{item.name}
              </span>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="w-40 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
