import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { PricePoint } from '@/hooks/use-token-chart';
import { Loader2 } from 'lucide-react';

interface TokenPriceChartProps {
  data: PricePoint[];
  isLoading?: boolean;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTooltipPrice(value: number): string {
  if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(8)}`;
}

export function TokenPriceChart({ data, isLoading }: TokenPriceChartProps) {
  const isPositive = useMemo(() => {
    if (data.length < 2) return true;
    return data[data.length - 1].price >= data[0].price;
  }, [data]);

  const color = isPositive ? '#34d399' : '#f87171'; // emerald-400 / red-400

  if (isLoading) {
    return (
      <div className="w-full h-[180px] bg-zinc-900/50 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[180px] bg-zinc-900/50 flex items-center justify-center">
        <span className="text-zinc-600 text-sm">Chart unavailable</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[180px] bg-zinc-900/50">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`chartGrad-${isPositive ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#71717a', fontSize: 10 }}
            minTickGap={40}
          />
          <YAxis
            domain={['auto', 'auto']}
            hide
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '12px',
              padding: '8px 12px',
              fontSize: '12px',
            }}
            labelFormatter={formatTime}
            formatter={(value: number) => [formatTooltipPrice(value), 'Price']}
            labelStyle={{ color: '#a1a1aa' }}
            itemStyle={{ color: '#ffffff' }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill={`url(#chartGrad-${isPositive ? 'up' : 'down'})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: '#18181b', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
