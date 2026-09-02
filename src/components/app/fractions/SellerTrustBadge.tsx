/**
 * Seller Trust Badge
 * ==================
 * A seller's delivery record, on the card.
 *
 * A fraction trade has no escrow contract behind it, so one leg lands second
 * and someone is briefly exposed. That is a real risk and the interface should
 * say so plainly instead of burying it: how many trades this seller has
 * settled, how fast, and whether any are past their deadline. A new seller
 * reads as new rather than as safe.
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FractionSellerStats } from '@/hooks/use-fraction-marketplace';

/** "in 4m", "in 2h" — the number a buyer actually wants before committing. */
function formatSettleTime(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

interface SellerTrustBadgeProps {
  stats: FractionSellerStats | null | undefined;
  className?: string;
  /** Compact hides the median settle time — for dense grid cards. */
  compact?: boolean;
}

export const SellerTrustBadge = memo(function SellerTrustBadge({
  stats,
  className,
  compact,
}: SellerTrustBadgeProps) {
  const { t } = useTranslation();
  const settled = Number(stats?.settled_trades || 0);
  const overdue = Number(stats?.overdue_trades || 0);
  const speed = formatSettleTime(stats?.avg_settle_seconds);

  if (overdue > 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-medium text-amber-300/90',
          className,
        )}
        title={t('fractions.overdueTitle', { count: overdue })}
      >
        <ShieldAlert className="w-3 h-3" />
        {t('fractions.lateCount', { count: overdue })}
      </span>
    );
  }

  if (settled === 0) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 text-[10px] text-white/40', className)}
        title={t('fractions.newSellerTitle')}
      >
        <Sparkles className="w-3 h-3" />
        {t('fractions.newSeller')}
      </span>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[10px] text-emerald-300/80', className)}
      title={t('fractions.settledTitle', { count: settled }) + (speed ? t('fractions.settledTitleSpeed', { speed }) : '')}
    >
      <ShieldCheck className="w-3 h-3" />
      {t('fractions.settledCount', { count: settled })}
      {!compact && speed && (
        <>
          <Clock className="w-3 h-3 ml-0.5" />
          {speed}
        </>
      )}
    </span>
  );
});
