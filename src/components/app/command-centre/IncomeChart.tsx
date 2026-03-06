import { Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { subHours, subDays, subWeeks, subMonths } from 'date-fns';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { useOnchainDHBTransfers } from '@/hooks/use-onchain-dhb-transfers';

const timeFilters = ['1h', '1d', '1w', '1m', 'Max'];
const COLORS = ['#22c55e', '#3b82f6', '#eab308', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

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

function truncateAddress(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function IncomeChart() {
  const [activeFilter, setActiveFilter] = useState('1m');
  const { isAuthenticated, walletAddress } = useAuth();
  const { t } = useTranslation();

  // Fetch tips received by this wallet from tip_records
  const { data: tipRecords = [], isLoading } = useQuery({
    queryKey: ['tip-records-received', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const { data, error } = await supabase
        .from('tip_records')
        .select('sender_address, amount, created_at')
        .eq('receiver_address', walletAddress.toLowerCase())
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[IncomeChart] Error fetching tip records:', error);
        return [];
      }
      return data || [];
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 30_000,
  });

  const filteredTips = useMemo(() => {
    const startDate = getFilterStartDate(activeFilter);
    if (!startDate) return tipRecords;
    return tipRecords.filter((tip) => new Date(tip.created_at) >= startDate);
  }, [tipRecords, activeFilter]);

  const { chartData, totalEarned } = useMemo(() => {
    if (filteredTips.length === 0) return { chartData: [], totalEarned: 0 };

    const bySender: Record<string, number> = {};
    let total = 0;

    for (const tip of filteredTips) {
      const sender = tip.sender_address;
      bySender[sender] = (bySender[sender] || 0) + Number(tip.amount);
      total += Number(tip.amount);
    }

    const sorted = Object.entries(bySender)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8); // top 8 senders

    const data = sorted.map(([address, value], i) => ({
      name: truncateAddress(address),
      fullAddress: address,
      value: Math.round((value / total) * 1000) / 10,
      rawValue: Math.round(value * 100) / 100,
      color: COLORS[i % COLORS.length],
    }));

    return { chartData: data, totalEarned: Math.round(total * 100) / 100 };
  }, [filteredTips]);

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      {/* Header with time filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 mr-auto">
          <span className="text-white font-semibold">{t('commandCentre.incomeChart')}</span>
          {totalEarned > 0 && (
            <span className="text-emerald-400 text-sm font-semibold">{totalEarned} DHB</span>
          )}
        </div>
        <GlassFilterRow
          items={timeFilters.map((f) => ({ key: f, label: f }))}
          activeKey={activeFilter}
          onSelect={(key) => setActiveFilter(key)}
        />
      </div>

      {/* Donut Chart with Legend */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : chartData.length > 0 ? (
        <div className="flex items-center justify-center gap-6">
          <div className="space-y-3 min-w-0">
            {chartData.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-zinc-300 truncate">
                  <span className="font-medium" style={{ color: item.color }}>{item.value}%</span>
                  {' '}{item.name}
                  <span className="text-zinc-500 ml-1">({item.rawValue})</span>
                </span>
              </div>
            ))}
          </div>

          <div className="w-40 h-40 flex-shrink-0">
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
