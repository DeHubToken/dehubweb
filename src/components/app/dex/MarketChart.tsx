import { useState } from 'react';
import { formatPrice, formatSize, type BookLevel } from '@/lib/dex/orderbook';
import type { PricePoint } from '@/lib/dex/market-data';

export function MarketChart({ points, bids, asks, depth }: { points: PricePoint[]; bids: BookLevel[]; asks: BookLevel[]; depth: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = depth ? [...bids, ...asks].map((level) => ({ x: level.price, y: level.cumulativeDhb }))
    : points.map((point) => ({ x: point.time, y: point.price }));
  if (!data.length) return <div className="dex-chart-empty"><span className="dex-empty-icon">↗</span><strong>{depth ? 'The book starts here' : 'No trades in this window'}</strong><p>{depth ? 'Place the first range order to add liquidity.' : 'Choose a longer timeframe to see more history.'}</p></div>;
  const minX = Math.min(...data.map((p) => p.x)), maxX = Math.max(...data.map((p) => p.x));
  const low = depth ? 0 : Math.min(...data.map((p) => p.y));
  const high = Math.max(...data.map((p) => p.y));
  const padding = depth ? high * 0.08 : Math.max((high - low) * 0.15, high * 0.005);
  const minY = Math.max(0, low - padding), maxY = high + padding;
  const x = (value: number) => 14 + (maxX === minX ? 0.5 : (value - minX) / (maxX - minX)) * 626;
  const y = (value: number) => 270 - (value - minY) / (maxY - minY || 1) * 240;
  const line = (values: { x: number; y: number }[], step: boolean) => values.map((p, index) =>
    `${index ? step ? `H${x(p.x)}V${y(p.y)}` : `L${x(p.x)},${y(p.y)}` : `M${x(p.x)},${y(p.y)}`}`).join(' ');
  const pricePath = line(data, false);
  const cursor = hover == null ? null : data.reduce((best, p) => Math.abs(x(p.x) - hover) < Math.abs(x(best.x) - hover) ? p : best, data[0]);
  const depthPath = (levels: BookLevel[]) => {
    const values = [...levels].sort((a, b) => a.price - b.price).map((p) => ({ x: p.price, y: p.cumulativeDhb }));
    const path = line(values, true);
    return { path, fill: values.length ? `${path}L${x(values.at(-1)!.x)},270L${x(values[0].x)},270Z` : '' };
  };
  return <div className="dex-chart" role="img" aria-label={depth ? 'Combined range liquidity by USDC price' : 'Combined DHB market reference history in USD'}>
    <div className="dex-chart-readout">{cursor ? <><b>{depth ? `${formatSize(cursor.y)} DHB` : `$${formatPrice(cursor.y)}`}</b><span>{depth ? `${formatPrice(cursor.x)} USDC` : new Date(cursor.x * 1000).toLocaleString()}</span></> : <span>{depth ? 'Cumulative DHB · hover to inspect' : 'Market reference · USD · hover to inspect'}</span>}</div>
    <svg viewBox="0 0 730 310" onPointerLeave={() => setHover(null)} onPointerMove={(event) => {
      const rect = event.currentTarget.getBoundingClientRect(); setHover((event.clientX - rect.left) / rect.width * 730);
    }}>
      {[0, 1, 2, 3, 4].map((i) => { const value = minY + (maxY - minY) * i / 4; return <g key={i}><line x1="14" x2="640" y1={y(value)} y2={y(value)} stroke="#23282f" strokeDasharray="3 5" /><text x="652" y={y(value) + 4} fill="#89939f" fontSize="10">{depth ? formatSize(value) : formatPrice(value)}</text></g>; })}
      {depth ? ([{ levels: bids, color: '#20c997' }, { levels: asks, color: '#f05b72' }]).map(({ levels, color }) => { const paths = depthPath(levels); return <g key={color}><path d={paths.fill} fill={color} fillOpacity=".12" /><path d={paths.path} fill="none" stroke={color} strokeWidth="2" />{levels.length === 1 && <circle cx={x(levels[0].price)} cy={y(levels[0].cumulativeDhb)} r="3" fill={color} />}</g>; }) : <><path d={`${pricePath}L${x(data.at(-1)!.x)},270L${x(data[0].x)},270Z`} fill="#20c997" fillOpacity=".07" /><path d={pricePath} fill="none" stroke="#20c997" strokeWidth="2" vectorEffect="non-scaling-stroke" /><circle cx={x(data.at(-1)!.x)} cy={y(data.at(-1)!.y)} r="3" fill="#20c997" /></>}
      {cursor && <><line x1={x(cursor.x)} x2={x(cursor.x)} y1="20" y2="270" stroke="#89939f" strokeDasharray="3 4" /><line x1="14" x2="640" y1={y(cursor.y)} y2={y(cursor.y)} stroke="#89939f" strokeDasharray="3 4" /><circle cx={x(cursor.x)} cy={y(cursor.y)} r="4" fill="#fff" /></>}
      {[0, 0.5, 1].map((fraction) => { const value = minX + (maxX - minX) * fraction; return <text key={fraction} x={14 + 626 * fraction} y="298" textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'} fill="#89939f" fontSize="10">{depth ? formatPrice(value) : new Date(value * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })}</text>; })}
    </svg>
  </div>;
}
