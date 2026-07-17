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
const cardClass = "rounded-2xl p-5 bg-zinc-900 border border-zinc-800";

const SOURCE_CONFIG = [
  { key: 'tips', label: 'Tips', color: '#22c55e' },
  { key: 'subs', label: 'Subs', color: '#3b82f6' },
  { key: 'adRevenue', label: 'Ad Revenue', color: '#eab308' },
  { key: 'bounties', label: 'Bounties', color: '#a855f7' },
  { key: 'ppv', label: 'PPV Sales', color: '#ec4899' },
] as const;

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

export function IncomeChart() {
  const [activeFilter, setActiveFilter] = useState('1m');
  const { isAuthenticated, walletAddress } = useAuth();
  const { t } = useTranslation();

  // Fetch tips received
  const { data: tipRecords = [], isLoading: tipsLoading } = useQuery({
    queryKey: ['tip-records-received', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const { data, error } = await supabase
        .from('tip_records')
        .select('amount, created_at, tx_hash')
        .eq('receiver_address', walletAddress.toLowerCase())
        .order('created_at', { ascending: false });
      if (error) { console.error('[IncomeChart] tip_records error:', error); return []; }
      return data || [];
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 30_000,
  });

  // Fetch PPV sales as creator
  const { data: ppvRecords = [], isLoading: ppvLoading } = useQuery({
    queryKey: ['ppv-sales-received', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const { data, error } = await supabase
        .from('ppv_purchases')
        .select('amount, created_at')
        .eq('creator_address', walletAddress.toLowerCase())
        .order('created_at', { ascending: false });
      if (error) { console.error('[IncomeChart] ppv_purchases error:', error); return []; }
      return data || [];
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 30_000,
  });

  // On-chain DHB transfers
  const { data: onchainTransfers = [], isLoading: onchainLoading } = useOnchainDHBTransfers(walletAddress);

  const isLoading = tipsLoading || ppvLoading || onchainLoading;

  const { chartData, totalEarned } = useMemo(() => {
    const startDate = getFilterStartDate(activeFilter);

    const inRange = (dateStr: string) => !startDate || new Date(dateStr) >= startDate;

    // Tips from Supabase
    let tipsTotal = 0;
    tipRecords.forEach((r: any) => {
      if (inRange(r.created_at)) tipsTotal += Number(r.amount);
    });

    // On-chain incoming (non-fiat, not already in tip_records) → add to tips
    const supabaseTxHashes = new Set(tipRecords.map((t: any) => t.tx_hash?.toLowerCase()).filter(Boolean));
    onchainTransfers.forEach(transfer => {
      if (!transfer.isIncoming || transfer.isFiatPurchase) return;
      if (transfer.txHash && supabaseTxHashes.has(transfer.txHash.toLowerCase())) return;
      const ts = new Date(transfer.timestamp * 1000).toISOString();
      if (inRange(ts)) tipsTotal += transfer.amount;
    });

    // PPV Sales
    let ppvTotal = 0;
    ppvRecords.forEach((r: any) => {
      if (inRange(r.created_at)) ppvTotal += Number(r.amount);
    });

    // Subs, Ad Revenue, Bounties — no DB source yet, placeholder 0
    const subsTotal = 0;
    const adRevenueTotal = 0;
    const bountiesTotal = 0;

    const totals: Record<string, number> = {
      tips: Math.round(tipsTotal * 100) / 100,
      subs: Math.round(subsTotal * 100) / 100,
      adRevenue: Math.round(adRevenueTotal * 100) / 100,
      bounties: Math.round(bountiesTotal * 100) / 100,
      ppv: Math.round(ppvTotal * 100) / 100,
    };

    const total = Object.values(totals).reduce((a, b) => a + b, 0);

    const data = SOURCE_CONFIG
      .filter(s => totals[s.key] > 0)
      .map(s => ({
        name: s.label,
        value: total > 0 ? Math.round((totals[s.key] / total) * 1000) / 10 : 0,
        rawValue: totals[s.key],
        color: s.color,
      }));

    return { chartData: data, totalEarned: Math.round(total * 100) / 100 };
  }, [tipRecords, ppvRecords, onchainTransfers, activeFilter]);

  return (
    <div data-page-bento className={cardClass}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 mr-auto">
          <span className="text-white font-semibold">{t('commandCentre.incomeChart')}</span>
          {totalEarned > 0 && (
            <span className="text-emerald-400 text-sm font-semibold">{totalEarned.toLocaleString()} DHB</span>
          )}
        </div>
        <GlassFilterRow
          items={timeFilters.map((f) => ({ key: f, label: f }))}
          activeKey={activeFilter}
          onSelect={(key) => setActiveFilter(key)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : chartData.length > 0 ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-36 h-36 flex-shrink-0">
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

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
            {chartData.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-zinc-300 whitespace-nowrap">
                  <span className="font-medium" style={{ color: item.color }}>{item.value}%</span>
                  {' '}{item.name}
                  <span className="text-zinc-500 ml-1">({item.rawValue.toLocaleString()})</span>
                </span>
              </div>
            ))}
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