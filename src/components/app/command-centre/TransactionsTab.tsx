import { useState } from 'react';
import { TrendingUp, Info, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Line, ComposedChart } from 'recharts';
import { PieChart, Pie, Cell } from 'recharts';
import dehubCoin from '@/assets/dehub-coin.png';

const chartData = [
  { month: 'Jan', income: 45000, expenditure: 30000 },
  { month: 'Feb', income: 77567, expenditure: 23831 },
  { month: 'Mar', income: 65000, expenditure: 35000 },
  { month: 'Apr', income: 58000, expenditure: 28000 },
  { month: 'May', income: 72000, expenditure: 32000 },
  { month: 'Jun', income: 85000, expenditure: 40000 },
];

const breakdownData = [
  { name: 'Subscriptions', value: 46.2, color: '#22c55e' },
  { name: 'Withdrawals', value: 23.7, color: '#3b82f6' },
  { name: 'Tips', value: 15.9, color: '#ef4444' },
  { name: 'Deposits', value: 12.2, color: '#eab308' },
];

const transactionList = [
  { date: '06-Mar-24', type: 'Tips', amount: '- 400 DeHub', method: 'Wallet', status: 'Complete' },
  { date: '29-Feb-24', type: 'Subscription', amount: '5600 DeHub', method: 'Wallet', status: 'Complete' },
  { date: '15-Feb-24', type: 'Deposit', amount: '+ 10000 DeHub', method: 'Fiat Gateway', status: 'Complete' },
  { date: '06-Mar-24', type: 'Tips', amount: '- 400 DeHub', method: 'Wallet', status: 'Complete' },
  { date: '15-Feb-24', type: 'Deposit', amount: '+ 10000 DeHub', method: 'Fiat Gateway', status: 'Complete' },
];

const timeFilters = ['1h', '1d', '1w', '1m', 'Max'];

export function TransactionsTab() {
  const [activeFilter, setActiveFilter] = useState('1m');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Transactions</h2>
        <div className="flex gap-2">
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm h-9 px-4 rounded-xl">
            Add funds
          </Button>
          <Button variant="outline" className="border-zinc-700 text-white text-sm h-9 px-4 rounded-xl bg-transparent hover:bg-zinc-800">
            Withdraw
          </Button>
        </div>
      </div>

      {/* Top Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Total Transactions Card */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-zinc-400 text-sm">Total transactions</span>
                <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Increased by 27%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-3xl sm:text-4xl font-bold text-white">490,890</span>
                <img src={dehubCoin} alt="DeHub" className="w-5 h-5" />
              </div>
              <p className="text-zinc-500 text-sm mt-1"><span className="text-white">50,698 DeHub</span> more than last month.</p>
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

          <p className="text-zinc-400 text-sm mb-2">Income vs. Expenditure</p>

          {/* Time Filters */}
          <div className="flex items-center gap-1 mb-4 bg-zinc-800/50 rounded-xl p-1 w-fit">
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

          {/* Chart */}
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#71717a', fontSize: 11 }}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString()} DeHub`, 
                    name === 'income' ? 'Income' : 'Expenditure'
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#incomeGradient)"
                />
                <Line
                  type="monotone"
                  dataKey="expenditure"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-blue-500" />
              <span className="text-zinc-400">Income/Expenditure</span>
            </div>
            <div className="flex items-center gap-1 bg-zinc-800 px-2 py-1 rounded text-blue-400">
              <span>↑ 77,567 DeHub</span>
            </div>
            <div className="flex items-center gap-1 bg-zinc-800 px-2 py-1 rounded text-red-400">
              <span>↓ 23,831 DeHub</span>
            </div>
          </div>
        </div>

        {/* Transaction Breakdown Card */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-zinc-400 text-sm">Transaction breakdown</span>
              <p className="text-zinc-500 text-xs mt-1">
                Most amount of transaction <span className="text-white">236509 DeHub</span> through
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
          <div className="flex items-center justify-center gap-8">
            <div className="space-y-2">
              {breakdownData.slice(0, 2).map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-zinc-400">{item.value}% {item.name}</span>
                </div>
              ))}
            </div>

            <div className="w-40 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {breakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {breakdownData.slice(2).map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-zinc-400">{item.value}% {item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white font-semibold">Transaction list</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 text-xs h-8 rounded-xl bg-transparent">
              Filter ▼
            </Button>
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 text-xs h-8 rounded-xl bg-transparent">
              Export CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                <th className="text-left font-normal pb-3">Date</th>
                <th className="text-left font-normal pb-3">Type</th>
                <th className="text-left font-normal pb-3">Amount</th>
                <th className="text-left font-normal pb-3">Payment method</th>
                <th className="text-left font-normal pb-3">Status</th>
                <th className="text-left font-normal pb-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {transactionList.map((tx, index) => (
                <tr key={index} className="text-zinc-400">
                  <td className="py-4">{tx.date}</td>
                  <td className="py-4">{tx.type}</td>
                  <td className={`py-4 ${tx.amount.startsWith('+') ? 'text-emerald-400' : tx.amount.startsWith('-') ? 'text-red-400' : 'text-white'}`}>
                    {tx.amount}
                  </td>
                  <td className="py-4">{tx.method}</td>
                  <td className="py-4 text-emerald-400">{tx.status}</td>
                  <td className="py-4">
                    <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 text-xs h-7 rounded-xl bg-transparent">
                      View transaction
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
