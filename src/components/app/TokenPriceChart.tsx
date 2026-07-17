import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { PricePoint, ChartTimeframe } from '@/hooks/use-token-chart';
import { Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface TokenPriceChartProps {
  data: PricePoint[];
  isLoading?: boolean;
  timeframe?: ChartTimeframe;
  onTimeframeChange?: (tf: ChartTimeframe) => void;
  /** Full external URL for the "ALL" button (e.g. CMC or CoinGecko page) */
  externalUrl?: string;
}

const SELECTABLE_TIMEFRAMES: ChartTimeframe[] = ['1D', '7D', '30D', '90D', '1Y'];

function formatTime(timestamp: number, timeframe: ChartTimeframe = '7D'): string {
  const d = new Date(timestamp);
  if (timeframe === '1D') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (timeframe === '7D' || timeframe === '30D') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
}

function formatTooltipPrice(value: number): string {
  if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(8)}`;
}

function formatTooltipLabel(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TokenPriceChart({ data, isLoading, timeframe = '7D', onTimeframeChange, externalUrl }: TokenPriceChartProps) {
  const isPositive = useMemo(() => {
    if (data.length < 2) return true;
    return data[data.length - 1].price >= data[0].price;
  }, [data]);

  const percentChange = useMemo(() => {
    if (data.length < 2) return null;
    const first = data[0].price;
    const last = data[data.length - 1].price;
    if (first === 0) return null;
    return ((last - first) / first) * 100;
  }, [data]);

  const color = isPositive ? '#34d399' : '#f87171';

  const chartContent = isLoading ? (
    <div className="w-full h-[180px] bg-zinc-900/50 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
    </div>
  ) : !data || data.length === 0 ? (
    <div className="w-full h-[180px] bg-zinc-900/50 flex items-center justify-center">
      <span className="text-zinc-600 text-sm">Chart unavailable</span>
    </div>
  ) : (
    <div className="w-full h-[180px] bg-zinc-900/50">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 4 }}>
          <defs>
            <linearGradient id={`chartGrad-${isPositive ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tickFormatter={(t) => formatTime(t, timeframe)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#71717a', fontSize: 10 }}
            minTickGap={20}
            padding={{ left: 10, right: 10 }}
          />
          <YAxis domain={['auto', 'auto']} hide />
          <Tooltip
            contentStyle={{
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '12px',
              padding: '8px 12px',
              fontSize: '12px',
            }}
            labelFormatter={(t) => formatTooltipLabel(t)}
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

  return (
    <div>
      {chartContent}

      {/* Timeframe selector + period change badge */}
      {onTimeframeChange && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-700/50">
          <div className="relative flex items-center gap-0.5 rounded-lg bg-zinc-800/60 p-0.5">
            {SELECTABLE_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={cn(
                  "relative z-10 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-200",
                  timeframe === tf
                    ? "text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {timeframe === tf && (
                  <motion.div
                    layoutId="timeframe-pill"
                    className="absolute inset-0 rounded-md bg-white/15 border border-white/10"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tf}</span>
              </button>
            ))}
            {/* ALL button → opens external page */}
            {externalUrl && (
              <button
                onClick={() => window.open(externalUrl, '_blank', 'noopener')}
                className="relative z-10 px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5 transition-colors duration-200"
              >
                ALL
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
          {percentChange != null && !isLoading && (
            <span className={cn(
              "text-[11px] font-medium",
              percentChange >= 0 ? "text-emerald-400" : "text-red-400"
            )}>
              {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
