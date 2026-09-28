import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubscriptionCredits } from '@/hooks/use-subscription-credits';
import dehubCoin from '@/assets/dehub-coin.png';

// Carries the wallet and funding stack, so it only loads when opened.
const TopUpDialog = lazy(() => import('./SubscriptionCreditsTopUpDialog'));

/**
 * Subscription-token balance with a usage bar, in dollars, and a way to add
 * more. Shown to every signed-in user: an empty balance is exactly when the
 * top-up button matters.
 */

const usdFormat = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

function useCreditUsage() {
  const { data } = useSubscriptionCredits();
  if (!data) return null;
  const total = Math.max(0, data.totalAddedUsd ?? 0);
  const spent = total > 0 ? Math.min(total, data.totalSpentUsd ?? Math.max(0, total - data.usd)) : 0;
  return {
    left: data.usd,
    spent,
    total,
    percentUsed: total > 0 ? Math.round((spent / total) * 100) : 0,
  };
}

type Usage = NonNullable<ReturnType<typeof useCreditUsage>>;

function UsageBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div
      className={cn('h-1.5 w-full rounded-full bg-white/10 overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

function UsageCard({ usage, onOpenWallet, onTopUp }: { usage: Usage; onOpenWallet: () => void; onTopUp: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <button type="button" onClick={onOpenWallet} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img src={dehubCoin} alt="" className="w-5 h-5 shrink-0" />
            <span className="text-xs text-zinc-400 truncate">{t('subscriptions.subscriptionTokens')}</span>
          </div>
          <span className="text-sm font-semibold text-white tabular-nums">{usdFormat(usage.left)}</span>
        </div>
        <UsageBar percent={usage.percentUsed} className="mt-2.5" />
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500 tabular-nums">
          {usage.total > 0 ? (
            <>
              <span>{t('subscriptions.percentUsed', { percent: usage.percentUsed })}</span>
              <span>{t('subscriptions.spentOfTotal', { spent: usdFormat(usage.spent), total: usdFormat(usage.total) })}</span>
            </>
          ) : (
            <span>{t('subscriptions.topUpEmptyHint')}</span>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={onTopUp}
        className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-white text-black hover:bg-white/90 py-1.5 text-xs font-semibold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        {t('subscriptions.topUp')}
      </button>
    </>
  );
}

function TopUp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <TopUpDialog open={open} onOpenChange={onOpenChange} />
    </Suspense>
  );
}

/** Desktop rail. Collapsed, it is the coin over a thin bar and opens the top-up. */
export function SubscriptionCreditsSidebarCard({ collapsed }: { collapsed: boolean }) {
  const usage = useCreditUsage();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [topUpOpen, setTopUpOpen] = useState(false);
  if (!usage) return null;

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          onClick={() => setTopUpOpen(true)}
          title={`${t('subscriptions.subscriptionTokens')}: ${usdFormat(usage.left)}`}
          className="mt-3 w-full h-[44px] p-2 rounded-2xl bg-zinc-900/90 border border-white/10 hover:bg-zinc-800/90 transition-colors flex flex-col items-center justify-center gap-1"
        >
          <img src={dehubCoin} alt="" className="w-5 h-5" />
          <UsageBar percent={usage.percentUsed} className="h-1" />
        </button>
      ) : (
        <div className="mt-3 w-full rounded-2xl bg-zinc-900/90 border border-white/10 p-3">
          <UsageCard usage={usage} onOpenWallet={() => navigate('/app/wallet')} onTopUp={() => setTopUpOpen(true)} />
        </div>
      )}
      <TopUp open={topUpOpen} onOpenChange={setTopUpOpen} />
    </>
  );
}

/** Mobile header pill; tapping it shows the full card. */
export function SubscriptionCreditsPill() {
  const usage = useCreditUsage();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  if (!usage) return null;

  return (
    <div className="relative mr-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('subscriptions.subscriptionTokens')}
        className="flex items-center gap-1.5 rounded-full bg-white/10 border border-white/10 pl-1 pr-2.5 py-1"
      >
        <img src={dehubCoin} alt="" className="w-[18px] h-[18px]" />
        <span className="text-xs font-semibold text-white tabular-nums">{usdFormat(usage.left)}</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label={t('subscriptions.close')}
            className="fixed inset-0 z-[70] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-[71] w-64 rounded-2xl bg-zinc-950/95 backdrop-blur-md border border-white/10 p-3 shadow-2xl">
            <UsageCard
              usage={usage}
              onOpenWallet={() => {
                setOpen(false);
                navigate('/app/wallet');
              }}
              onTopUp={() => {
                setOpen(false);
                setTopUpOpen(true);
              }}
            />
          </div>
        </>
      )}
      <TopUp open={topUpOpen} onOpenChange={setTopUpOpen} />
    </div>
  );
}
