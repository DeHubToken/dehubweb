/**
 * AdsOverviewTab
 * ==============
 * Portal landing view: live balance, cross-campaign KPIs (spend, impressions,
 * clicks, CTR, eCPM) from ad_daily_stats rollups, a 14-day performance chart,
 * and quick campaign access. All real data — nothing simulated.
 */

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Wallet, Eye, MousePointerClick, DollarSign, Rocket, Plus, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdAccount, useAdCampaigns, useAllCampaignStats } from '@/hooks/use-ads';
import { CAMPAIGN_STATUS_LABELS, formatCompact, formatUsd, type AdCampaign } from '@/lib/ads/povr';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-500',
  pending_review: 'bg-yellow-500/15 text-yellow-500',
  paused: 'bg-zinc-500/15 text-muted-foreground',
  draft: 'bg-foreground/10 text-muted-foreground',
  rejected: 'bg-red-500/15 text-red-500',
  completed: 'bg-blue-500/15 text-blue-400',
  archived: 'bg-foreground/5 text-muted-foreground',
};

export function StatusPill({ status }: { status: AdCampaign['status'] }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', STATUS_STYLES[status] || STATUS_STYLES.draft)}>
      {CAMPAIGN_STATUS_LABELS[status] ?? status}
    </span>
  );
}

interface AdsOverviewTabProps {
  onOpenCampaign: (id: string) => void;
  onNewCampaign: () => void;
  onGoBilling: () => void;
}

export function AdsOverviewTab({ onOpenCampaign, onNewCampaign, onGoBilling }: AdsOverviewTabProps) {
  const { data: account } = useAdAccount();
  const { data: campaigns = [], isLoading } = useAdCampaigns();
  const { data: stats = [] } = useAllCampaignStats(campaigns.map((c) => c.id));

  const kpis = useMemo(() => {
    let impressions = 0, clicks = 0, spend = 0;
    for (const s of stats) {
      impressions += s.impressions;
      clicks += s.clicks;
      spend += Number(s.spend_usd);
    }
    return {
      impressions,
      clicks,
      spend,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      ecpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    };
  }, [stats]);

  const chartData = useMemo(() => {
    const byDay = new Map<string, { day: string; impressions: number; clicks: number; spend: number }>();
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      days.push(d);
      byDay.set(d, { day: d.slice(5), impressions: 0, clicks: 0, spend: 0 });
    }
    for (const s of stats) {
      const row = byDay.get(s.day);
      if (row) {
        row.impressions += s.impressions;
        row.clicks += s.clicks;
        row.spend += Number(s.spend_usd);
      }
    }
    return days.map((d) => byDay.get(d)!);
  }, [stats]);

  const recent = campaigns.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Balance + KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={onGoBilling}
          className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-left hover:bg-foreground/[0.06] transition-colors"
        >
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Wallet className="w-3.5 h-3.5" /> Balance</div>
          <p className="text-xl font-bold text-foreground">{formatUsd(account?.balance_usd)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Top up →</p>
        </button>
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" /> Spend</div>
          <p className="text-xl font-bold text-foreground">{formatUsd(kpis.spend)}</p>
        </div>
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Eye className="w-3.5 h-3.5" /> Impressions</div>
          <p className="text-xl font-bold text-foreground">{formatCompact(kpis.impressions)}</p>
        </div>
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><MousePointerClick className="w-3.5 h-3.5" /> Clicks</div>
          <p className="text-xl font-bold text-foreground">{formatCompact(kpis.clicks)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{kpis.ctr.toFixed(2)}% CTR</p>
        </div>
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="w-3.5 h-3.5" /> eCPM</div>
          <p className="text-xl font-bold text-foreground">{formatUsd(kpis.ecpm)}</p>
        </div>
      </div>

      {/* 14-day chart */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
        <p className="text-sm font-semibold text-foreground mb-3">Last 14 days</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.35} />
            <YAxis tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.35} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: '#a1a1aa' }}
            />
            <Line type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={2} dot={false} name="Impressions" />
            <Line type="monotone" dataKey="clicks" stroke="#22c55e" strokeWidth={2} dot={false} name="Clicks" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent campaigns */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-foreground">Campaigns</p>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={onNewCampaign}>
            <Plus className="w-4 h-4 mr-1" /> New
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : recent.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <Rocket className="w-7 h-7 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No campaigns yet. Launch your first in minutes.</p>
            <Button variant="glass" size="sm" onClick={onNewCampaign}>
              <Plus className="w-4 h-4 mr-1" /> Create campaign
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpenCampaign(c.id)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-foreground/10 px-3.5 py-3 hover:bg-foreground/5 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatUsd(c.spent_usd)} / {formatUsd(c.total_budget_usd)} spent
                  </p>
                </div>
                <StatusPill status={c.status} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
