/**
 * Floating Chart PiP Widget
 * ==========================
 * Draggable + resizable floating mini-chart that persists across navigation.
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { X, GripHorizontal, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip, XAxis } from 'recharts';
import { useTokenChart, type ChartTimeframe } from '@/hooks/use-token-chart';
import type { ChartPiPItem } from '@/contexts/ChartPiPContext';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface FloatingChartPiPProps {
  item: ChartPiPItem;
  index: number;
  onClose: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ChartPiPItem>) => void;
}

const MIN_W = 220;
const MIN_H = 160;
const DEFAULT_W = 320;
const DEFAULT_H = 220;
const TIMEFRAMES: ChartTimeframe[] = ['1D', '7D', '30D', '90D', '1Y'];

export function FloatingChartPiP({ item, index, onClose, onUpdate }: FloatingChartPiPProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('1D');

  const [size, setSize] = useState({ w: item.width || DEFAULT_W, h: item.height || DEFAULT_H });
  const [position, setPosition] = useState({
    x: item.x ?? window.innerWidth - (DEFAULT_W + 16 + index * 30),
    y: item.y ?? 80 + index * 30,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const cleanSymbol = useMemo(() => `$${item.symbol.replace(/^\$/, '').toUpperCase()}`, [item.symbol]);
  const { data: chartData } = useTokenChart(cleanSymbol, true, timeframe);

  const isPositive = useMemo(() => {
    if (!chartData || chartData.length < 2) return true;
    return chartData[chartData.length - 1].price >= chartData[0].price;
  }, [chartData]);

  const percentChange = useMemo(() => {
    if (!chartData || chartData.length < 2) return null;
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    if (first === 0) return null;
    return ((last - first) / first) * 100;
  }, [chartData]);

  const color = isPositive ? '#34d399' : '#f87171';

  // Persist position/size
  useEffect(() => {
    if (!isDragging && !isResizing) {
      onUpdate(item.id, { x: position.x, y: position.y, width: size.w, height: size.h });
    }
  }, [isDragging, isResizing]);

  // Drag handlers
  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragOffset.current = { x: clientX - position.x, y: clientY - position.y };
    setIsDragging(true);
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - size.w, clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDragging, size.w]);

  // Resize handlers
  const onResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeStart.current = { x: clientX, y: clientY, w: size.w, h: size.h };
    setIsResizing(true);
  }, [size]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - resizeStart.current.x;
      const dy = clientY - resizeStart.current.y;
      setSize({
        w: Math.max(MIN_W, resizeStart.current.w + dx),
        h: Math.max(MIN_H, resizeStart.current.h + dy),
      });
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isResizing]);

  const currentPrice = chartData && chartData.length > 0 ? chartData[chartData.length - 1].price : null;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      className="fixed z-[9998] rounded-xl shadow-2xl border border-zinc-700/60 bg-zinc-900/95 backdrop-blur-md"
      style={{
        left: position.x,
        top: position.y,
        width: size.w,
        height: size.h,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Drag handle / header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-zinc-800/80 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          {item.logo && (
            <img src={item.logo} alt="" className="w-4 h-4 rounded-full shrink-0" />
          )}
          <span className="text-white text-xs font-bold truncate">{cleanSymbol}</span>
          {currentPrice != null && (
            <span className="text-zinc-400 text-[10px] truncate">
              ${currentPrice >= 1 ? currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : currentPrice.toFixed(6)}
            </span>
          )}
          {percentChange != null && (
            <span className={cn("text-[10px] font-medium flex items-center gap-0.5", isPositive ? "text-emerald-400" : "text-red-400")}>
              {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
            </span>
          )}
        </div>
        <button
          onClick={() => onClose(item.id)}
          className="text-zinc-500 hover:text-white transition-colors p-0.5 shrink-0"
          onMouseDown={e => e.stopPropagation()}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chart area */}
      <div className="flex-1" style={{ height: size.h - 68 }}>
        {chartData && chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`pip-grad-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#27272a',
                  border: '1px solid #3f3f46',
                  borderRadius: '12px',
                  padding: '6px 10px',
                  fontSize: '11px',
                }}
                labelFormatter={(t: number) => {
                  const d = new Date(t);
                  if (timeframe === '1D') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }}
                formatter={(value: number) => {
                  const formatted = value >= 1
                    ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                    : value >= 0.0001 ? `$${value.toFixed(6)}` : `$${value.toFixed(8)}`;
                  return [formatted, 'Price'];
                }}
                labelStyle={{ color: '#a1a1aa' }}
                itemStyle={{ color: '#ffffff' }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#pip-grad-${item.id})`}
                dot={false}
                activeDot={{ r: 3, fill: color, stroke: '#18181b', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Timeframe selector */}
      <div className="flex items-center justify-center gap-0.5 px-2 py-1.5 bg-zinc-800/60 border-t border-zinc-700/40">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
              timeframe === tf
                ? "bg-white/15 text-white border border-white/10"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Resize handle (bottom-right corner) */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={onResizeStart}
        onTouchStart={onResizeStart}
      >
        <svg className="w-4 h-4 text-zinc-600" viewBox="0 0 16 16">
          <path d="M14 14L8 14L14 8Z" fill="currentColor" opacity="0.5" />
          <path d="M14 14L12 14L14 12Z" fill="currentColor" opacity="0.8" />
        </svg>
      </div>
    </motion.div>
  );
}
