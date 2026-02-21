import { TrendingUp, TrendingDown, Info, Settings2, Loader2 } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dehubCoin from '@/assets/dehub-coin.png';
import { useAuth } from '@/contexts/AuthContext';
import { getDHBBalance } from '@/lib/contracts/stream-controller';
import { fromWei } from '@/lib/contracts/dhb-token';
import { getDPayTransactions, type DPayTransaction } from '@/lib/api/dpay';
import { subHours, subDays, subWeeks, subMonths, format } from 'date-fns';

const timeFilters = ['1h', '1d', '1w', '1m', 'Max'];

function getFilterStartDate(filter: string): Date | null {
  const now = new Date();
  switch (filter) {
    case '1h': return subHours(now, 1);
    case '1d': return subDays(now, 1);
    case '1w': return subWeeks(now, 1);
    case '1m': return subMonths(now, 1);
    default: return null;
  }
}

/** Build cumulative balance chart from transactions */
function buildBalanceChart(transactions: DPayTransaction[], currentBalance: number) {
  if (transactions.length === 0) return [];
  
  // Sort oldest first
  const sorted = [...transactions].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Work backwards from current balance to compute historical balances
  let runningBalance = currentBalance;
  const points: { date: string; balance: number; rawDate: Date }[] = [];
  
  // Add current point
  points.push({ 
    date: format(new Date(), 'MMM dd'), 
    balance: Math.round(currentBalance), 
    rawDate: new Date() 
  });

  // Go backwards through transactions to reconstruct balance history
  for (let i = sorted.length - 1; i >= 0; i--) {
    const tx = sorted[i];
    const isCredit = tx.type === 'buy' || tx.type === 'transfer';
    // Reverse the transaction to get prior balance
    if (isCredit) {
      runningBalance -= tx.amount;
    } else {
      runningBalance += tx.amount;
    }
    const txDate = new Date(tx.createdAt);
    points.unshift({
      date: format(txDate, 'MMM dd'),
      balance: Math.max(0, Math.round(runningBalance)),
      rawDate: txDate,
    });
  }

  // Deduplicate by date label, keeping last value per day
  const deduped = new Map<string, number>();
  points.forEach(p => deduped.set(p.date, p.balance));
  return Array.from(deduped.entries()).map(([date, balance]) => ({ date, balance }));
}

export function BalanceCard() {
  const [activeFilter, setActiveFilter] = useState('1m');
  const { walletAddress, isAuthenticated } = useAuth();

  // Fetch on-chain DHB balance
  const { data: rawBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ['dhb-balance', walletAddress?.toLowerCase()],
    queryFn: async () => {
      if (!walletAddress) return BigInt(0);
      return getDHBBalance(walletAddress);
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });

  const balance = rawBalance ? Number(fromWei(rawBalance)) : 0;
  const formattedBalance = Math.round(balance).toLocaleString();

  // Fetch transactions for chart
  const { data: transactions = [] } = useQuery({
    queryKey: ['dpay', 'transactions'],
    queryFn: getDPayTransactions,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Filter transactions by time window
  const filteredTxs = useMemo(() => {
    const startDate = getFilterStartDate(activeFilter);
    if (!startDate) return transactions;
    return transactions.filter((tx) => new Date(tx.createdAt) >= startDate);
  }, [transactions, activeFilter]);

  const chartData = useMemo(() => 
    buildBalanceChart(filteredTxs, balance), 
    [filteredTxs, balance]
  );

  // Calculate period change
  const periodChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].balance;
    const last = chartData[chartData.length - 1].balance;
    if (first === 0) return null;
    const pct = ((last - first) / first) * 100;
    return { pct: Math.round(pct * 10) / 10, isPositive: pct >= 0 };
  }, [chartData]);

  if (!isAuthenticated) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex items-center justify-center h-64">
        <p className="text-zinc-500 text-sm">Sign in to view your balance</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-zinc-400 text-sm">Total balance</span>
            {periodChange && (
              <span className={`text-xs px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                periodChange.isPositive 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {periodChange.isPositive 
                  ? <TrendingUp className="w-3 h-3" /> 
                  : <TrendingDown className="w-3 h-3" />}
                {periodChange.isPositive ? '+' : ''}{periodChange.pct}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <img src={dehubCoin} alt="DeHub" className="w-8 h-8 sm:w-9 sm:h-9" />
            {balanceLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            ) : (
              <span className="text-3xl sm:text-4xl font-bold text-white">{formattedBalance}</span>
            )}
          </div>
        </div>
      </div>

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
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#71717a', fontSize: 11 }}
              />
              <YAxis hide domain={['dataMin - 1000', 'dataMax + 1000']} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#18181b', 
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value: number) => [`${value.toLocaleString()} DHB`, 'Balance']}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#balanceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            {balanceLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'No transaction history yet'}
          </div>
        )}
      </div>
    </div>
  );
}
