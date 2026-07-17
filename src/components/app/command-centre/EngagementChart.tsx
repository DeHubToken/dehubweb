import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getMyAnalytics } from '@/lib/api/dehub';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';

type Range = '7d' | '30d' | '90d';
const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

function mergeTimeSeries(
  likes: { date: string; count: number }[],
  followers: { date: string; count: number }[],
) {
  const map = new Map<string, { date: string; likes: number; followers: number }>();
  likes.forEach(({ date, count }) => {
    map.set(date, { date, likes: count, followers: 0 });
  });
  followers.forEach(({ date, count }) => {
    const existing = map.get(date);
    if (existing) existing.followers = count;
    else map.set(date, { date, likes: 0, followers: count });
  });
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function EngagementChart() {
  const { walletAddress } = useAuth();
  const [range, setRange] = useState<Range>('30d');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-analytics', walletAddress, range],
    queryFn: () => getMyAnalytics(range),
    enabled: !!walletAddress,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const chartData = data
    ? mergeTimeSeries(data.likesOverTime, data.followersOverTime)
    : [];

  const fmtDate = (d: string) => {
    const [, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
  };

  return (
    <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold text-white">Engagement</span>
          </div>
          <GlassFilterRow
            items={RANGES.map(r => ({ key: r.key, label: r.label }))}
            activeKey={range}
            onSelect={(key) => setRange(key as Range)}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-36">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
          </div>
        ) : isError || chartData.length === 0 ? (
          <div className="flex items-center justify-center h-36 text-zinc-500 text-sm">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10, fill: '#71717a' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#71717a' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => v}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
              <Line type="monotone" dataKey="likes" stroke="#22c55e" dot={false} strokeWidth={2} name="Likes" />
              <Line type="monotone" dataKey="followers" stroke="#3b82f6" dot={false} strokeWidth={2} name="New Followers" />
            </LineChart>
          </ResponsiveContainer>
        )}

        {data && (
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/[0.06]">
            {[
              { label: 'Total Likes', value: data.totals.likes },
              { label: 'Followers', value: data.totals.followers },
              { label: 'Uploads', value: data.totals.uploads },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <div className="text-sm font-bold text-white">{stat.value.toLocaleString()}</div>
                <div className="text-[10px] text-zinc-500">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
