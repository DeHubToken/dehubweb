import { Info, Settings2, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getDPayTransactions, type DPayTransaction } from '@/lib/api/dpay';
import { useAuth } from '@/contexts/AuthContext';
import { subHours, subDays, subWeeks, subMonths } from 'date-fns';
import dehubCoin from '@/assets/dehub-coin.png';
import { AnimatedFilterPill } from '@/components/app/feeds/AnimatedFilterPill';

const timeFilters = ['1h', '1d', '1w', '1m', 'Max'];
const COLORS = ['#22c55e', '#3b82f6', '#eab308', '#ef4444', '#a855f7'];

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

function buildIncomeBreakdown(transactions: DPayTransaction[]) {
  const categories: Record<string, number> = {};
  let totalIncome = 0;

  transactions.forEach((tx) => {
    // Only count incoming transactions
    if (tx.type === 'buy' || tx.type === 'transfer') {
      const label = tx.type === 'buy' ? 'Purchases' : 'Transfers';
      categories[label] = (categories[label] || 0) + tx.amount;
      totalIncome += tx.amount;
    }
  });

  if (totalIncome === 0) return { data: [], totalIncome: 0, topSource: null };

  const data = Object.entries(categories)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value], i) => ({
      name,
      value: Math.round((value / totalIncome) * 1000) / 10,
      rawValue: Math.round(value),
      color: COLORS[i % COLORS.length],
    }));

  return { data, totalIncome: Math.round(totalIncome), topSource: data[0] || null };
}

export function IncomeChart() {
  const [activeFilter, setActiveFilter] = useState('1m');
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['dpay', 'transactions'],
    queryFn: getDPayTransactions,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const filteredTxs = useMemo(() => {
    const startDate = getFilterStartDate(activeFilter);
    if (!startDate) return transactions;
    return transactions.filter((tx) => new Date(tx.createdAt) >= startDate);
  }, [transactions, activeFilter]);

  const { data: chartData, totalIncome, topSource } = useMemo(
    () => buildIncomeBreakdown(filteredTxs),
    [filteredTxs]
  );

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      {/* Header with time filters on same line */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-400 text-sm">{t('commandCentre.incomeChart')}</span>
        <div className="flex items-center gap-1 pl-1 py-1">
          {timeFilters.map((filter) => (
            <AnimatedFilterPill
              key={filter}
              layoutId="income-time"
              isActive={activeFilter === filter}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </AnimatedFilterPill>
          ))}
        </div>
      </div>

      {/* Donut Chart with Legend */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : chartData.length > 0 ? (
        <div className="flex items-center justify-center gap-6">
          <div className="space-y-3">
            {chartData.map((item, index) => (
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

          <div className="w-40 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
          {t('commandCentre.noIncomeInPeriod')}
        </div>
      )}
    </div>
  );
}
