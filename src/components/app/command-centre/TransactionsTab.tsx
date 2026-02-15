import { useState, useMemo } from 'react';
import { TrendingUp, Info, Settings2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Line, ComposedChart } from 'recharts';
import { PieChart, Pie, Cell } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { getDPayTransactions, getDPayTotal, type DPayTransaction } from '@/lib/api/dpay';
import { useAuth } from '@/contexts/AuthContext';
import { subHours, subDays, subWeeks, subMonths } from 'date-fns';
import dehubCoin from '@/assets/dehub-coin.png';

const timeFilters = ['1h', '1d', '1w', '1m', 'Max'];

/** Get the start-date cutoff for the active time filter */
function getFilterStartDate(filter: string): Date | null {
  const now = new Date();
  switch (filter) {
    case '1h': return subHours(now, 1);
    case '1d': return subDays(now, 1);
    case '1w': return subWeeks(now, 1);
    case '1m': return subMonths(now, 1);
    default: return null; // 'Max' — no filtering
  }
}

/** Get the correct block explorer URL for a given chainId */
function getExplorerTxUrl(txHash: string, chainId?: number): string {
  if (chainId === 56) return `https://bscscan.com/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

// Generate chart data from transactions
function buildChartData(transactions: DPayTransaction[]) {
  if (transactions.length === 0) return [];
  
  // Group by month
  const months: Record<string, { income: number; expenditure: number }> = {};
  
  transactions.forEach((tx) => {
    const date = new Date(tx.createdAt);
    const key = date.toLocaleDateString('en-US', { month: 'short' });
    if (!months[key]) months[key] = { income: 0, expenditure: 0 };
    
    if (tx.type === 'buy' || tx.type === 'transfer') {
      months[key].income += tx.amount;
    } else {
      months[key].expenditure += tx.amount;
    }
  });
  
  return Object.entries(months).map(([month, data]) => ({
    month,
    income: Math.round(data.income),
    expenditure: Math.round(data.expenditure),
  }));
}

// Generate breakdown from transactions
function buildBreakdown(transactions: DPayTransaction[]) {
  const types: Record<string, number> = {};
  let total = 0;
  
  transactions.forEach((tx) => {
    const label = tx.type === 'buy' ? 'Purchases' : tx.type === 'sell' ? 'Sales' : 'Transfers';
    types[label] = (types[label] || 0) + tx.amount;
    total += tx.amount;
  });
  
  const colors = ['#22c55e', '#3b82f6', '#ef4444', '#eab308'];
  return Object.entries(types).map(([name, value], i) => ({
    name,
    value: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    color: colors[i % colors.length],
  }));
}

export function TransactionsTab() {
  const [activeFilter, setActiveFilter] = useState('1m');
  const { isAuthenticated } = useAuth();

  const { data: transactions = [], isLoading: txLoading, isError: txError } = useQuery({
    queryKey: ['dpay', 'transactions'],
    queryFn: getDPayTransactions,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const { data: totals } = useQuery({
    queryKey: ['dpay', 'totals'],
    queryFn: getDPayTotal,
    staleTime: 5 * 60_000,
  });

  // Filter transactions by the selected time window
  const filteredTransactions = useMemo(() => {
    const startDate = getFilterStartDate(activeFilter);
    if (!startDate) return transactions; // 'Max' — return all
    return transactions.filter((tx) => new Date(tx.createdAt) >= startDate);
  }, [transactions, activeFilter]);

  const chartData = buildChartData(filteredTransactions);
  const breakdownData = buildBreakdown(filteredTransactions);
  const totalVolume = totals?.totalVolume ?? 0;
  const totalCount = totals?.totalTransactions ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Transactions</h2>
        <div className="flex gap-2">
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm h-9 px-4 rounded-xl">
            Add funds
          </Button>
          <Button variant="glass" className="text-sm h-9 px-4 rounded-xl">
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
                <span className="text-zinc-400 text-sm">Total volume</span>
                {totalCount > 0 && (
                  <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {totalCount} txns
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-3xl sm:text-4xl font-bold text-white">
                  {totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <img src={dehubCoin} alt="DeHub" className="w-5 h-5" />
              </div>
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
            {chartData.length > 0 ? (
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
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                {txLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'No chart data yet'}
              </div>
            )}
          </div>
        </div>

        {/* Transaction Breakdown Card */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-zinc-400 text-sm">Transaction breakdown</span>
              {breakdownData.length > 0 && (
                <>
                  <p className="text-zinc-500 text-xs mt-1">
                    Largest category: <span className="text-emerald-400 font-medium">{breakdownData[0]?.name}</span>
                  </p>
                </>
              )}
            </div>
          </div>

          {breakdownData.length > 0 ? (
            <div className="flex items-center justify-center gap-8">
              <div className="space-y-2">
                {breakdownData.map((item, index) => (
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
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
              {txLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'No transactions yet'}
            </div>
          )}
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white font-semibold">Transaction list</span>
          <span className="text-xs text-zinc-500">
            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {txLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : txError ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-400 gap-2">
            <AlertCircle className="w-6 h-6" />
            <p className="text-sm">Failed to load transactions</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            {transactions.length === 0
              ? 'No transactions found. Make your first purchase!'
              : 'No transactions in this time period.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                  <th className="text-left font-normal pb-3">Date</th>
                  <th className="text-left font-normal pb-3">Type</th>
                  <th className="text-left font-normal pb-3">Amount</th>
                  <th className="text-left font-normal pb-3">Token</th>
                  <th className="text-left font-normal pb-3">Status</th>
                  <th className="text-left font-normal pb-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredTransactions.map((tx) => {
                  const date = new Date(tx.createdAt);
                  const dateStr = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' });
                  const isCredit = tx.type === 'buy';
                  
                  return (
                    <tr key={tx.id} className="text-zinc-400">
                      <td className="py-4">{dateStr}</td>
                      <td className="py-4 capitalize">{tx.type}</td>
                      <td className={`py-4 font-medium ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isCredit ? '+' : '-'} {tx.amount.toLocaleString()} DHB
                      </td>
                      <td className="py-4">{tx.tokenSymbol}</td>
                      <td className="py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-lg ${
                          tx.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                          tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-4">
                        {tx.txHash && (
                          <a
                            href={getExplorerTxUrl(tx.txHash, tx.chainId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-xs"
                          >
                            View tx
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}