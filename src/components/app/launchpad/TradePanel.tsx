import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { mockTrade } from '@/hooks/use-launchpad-trades';
import { toast } from 'sonner';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import type { LaunchpadToken } from '@/hooks/use-launchpad-tokens';

export function TradePanel({ token }: { token: LaunchpadToken }) {
  const { walletAddress, openLoginModal } = useAuth() as { walletAddress?: string; openLoginModal: () => void };
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const disabled = token.status !== 'bonding';

  async function submit() {
    if (!walletAddress) { openLoginModal(); return; }
    const n = Number(amount);
    if (!(n > 0)) { toast.error('Enter an amount'); return; }
    setBusy(true);
    try {
      await mockTrade({ tokenId: token.id, side, amount: n, traderAddress: walletAddress });
      setAmount('');
      toast.success(side === 'buy' ? `Bought ${token.symbol} (mock)` : `Sold ${token.symbol} (mock)`);
    } catch (e) {
      toast.error((e as Error)?.message ?? 'Trade failed');
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white/5 p-1">
        {(['buy','sell'] as const).map(s => (
          <button key={s} onClick={() => setSide(s)} className="shrink-0">
            <LiquidGlassBubble
              shimmer={false}
              noBorder={side !== s}
              className={`[&>div]:!rounded-lg [&>div]:!py-2 [&>div]:!w-full [&>div]:!text-center transition-all ${
                side === s
                  ? '[&>div]:!bg-white [&>div]:!text-black [&>div]:!font-semibold [&>div]:!shadow-none [&>div]:!border-transparent'
                  : '[&>div]:!text-white/70 [&>div]:!bg-gradient-to-br [&>div]:!from-white/[0.04] [&>div]:!via-white/[0.02] [&>div]:!to-transparent'
              }`}
            >
              <span className="text-sm font-semibold capitalize">{s}</span>
            </LiquidGlassBubble>
          </button>
        ))}
      </div>
      <div>
        <label className="text-[11px] uppercase text-white/50">{side === 'buy' ? 'Amount in DHB' : `Amount in ${token.symbol}`}</label>
        <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g,''))}
          inputMode="decimal" placeholder="0.00"
          className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-white text-lg font-semibold focus:outline-none focus:border-white/30" />
      </div>
      <div className="flex gap-1.5">
        {['1','10','100','1000'].map(v => (
          <button key={v} onClick={() => setAmount(v)} className="flex-1">
            <LiquidGlassBubble
              shimmer={false}
              noBorder
              className="[&>div]:!rounded-md [&>div]:!py-1.5 [&>div]:!w-full [&>div]:!text-center [&>div]:!text-white/80 [&>div]:!text-xs [&>div]:!bg-gradient-to-br [&>div]:!from-white/[0.04] [&>div]:!via-white/[0.02] [&>div]:!to-transparent hover:[&>div]:!bg-white/10"
            >
              <span>{v}</span>
            </LiquidGlassBubble>
          </button>
        ))}
      </div>
      <LiquidGlassBubble2
        label={disabled ? 'Trading closed' : busy ? 'Submitting…' : side === 'buy' ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
        loading={busy}
        loadingLabel="Submitting…"
        onClick={submit}
        disabled={disabled || busy}
        width="100%"
        height="48px"
      />
      <p className="text-[10px] text-white/40 text-center">Mock trade — no on-chain transaction. Phase 1.</p>
    </div>
  );
}
