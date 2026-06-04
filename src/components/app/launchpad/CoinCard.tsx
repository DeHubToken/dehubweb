import { Link } from 'react-router-dom';
import { BondingCurveProgress } from './BondingCurveProgress';
import type { LaunchpadToken } from '@/hooks/use-launchpad-tokens';

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n/1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtAge(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

export function CoinCard({ token }: { token: LaunchpadToken }) {
  return (
    <Link to={`/app/launchpad/${token.id}`}
      className="group block rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-4 hover:border-white/25 transition-colors">
      <div className="flex items-start gap-3">
        <div className="relative h-14 w-14 rounded-xl overflow-hidden border border-white/10 bg-white/5 shrink-0">
          {token.image_url
            ? <img src={token.image_url} alt={token.symbol} className="h-full w-full object-cover" loading="lazy" />
            : <div className="h-full w-full flex items-center justify-center text-white/60 text-lg font-bold">{token.symbol.slice(0,2)}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold truncate">{token.name}</span>
            <span className="text-white/50 text-xs uppercase">${token.symbol}</span>
          </div>
          <div className="text-white/50 text-xs mt-0.5">{fmtAge(token.created_at)} ago</div>
          {token.description && <p className="text-white/70 text-xs mt-1.5 line-clamp-2">{token.description}</p>}
        </div>
        <BondingCurveProgress progressBps={token.progress_bps} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/5 py-1.5">
          <div className="text-[10px] text-white/50 uppercase">Mcap</div>
          <div className="text-white text-xs font-semibold tabular-nums">{fmtUsd(token.market_cap_usd)}</div>
        </div>
        <div className="rounded-lg bg-white/5 py-1.5">
          <div className="text-[10px] text-white/50 uppercase">24h Vol</div>
          <div className="text-white text-xs font-semibold tabular-nums">{fmtUsd(token.volume_24h)}</div>
        </div>
        <div className="rounded-lg bg-white/5 py-1.5">
          <div className="text-[10px] text-white/50 uppercase">Status</div>
          <div className="text-white text-xs font-semibold capitalize">{token.status}</div>
        </div>
      </div>
    </Link>
  );
}
