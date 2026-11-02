/**
 * "Lock it" for a photo or video about to go out in a DM: off by default, one
 * tap shows quick prices, and the chosen price rides along with the send.
 * Prices are in dollars, like subscriptions; the DHB they come to is shown
 * underneath and worked out again at the moment someone pays.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LOCK_DEFAULT_USD,
  LOCK_MAX_USD,
  LOCK_MIN_USD,
  LOCK_QUICK_USD,
  formatLockDhb,
  formatLockUsd,
  lockDhbForUsd,
} from '@/lib/dm-lock-price';

/** Quick prices in USD. The first press of "Lock" picks the middle one. */
export const LOCK_QUICK_PRICES = LOCK_QUICK_USD;
export const LOCK_MIN_PRICE = LOCK_MIN_USD;
export const LOCK_MAX_PRICE = LOCK_MAX_USD;

interface LockPriceControlProps {
  value: number | null;
  onChange: (price: number | null) => void;
  kind: 'image' | 'video';
}

export function LockPriceControl({ value, onChange, kind }: LockPriceControlProps) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState('');
  const on = value !== null;

  const toggle = () => {
    if (on) {
      onChange(null);
      return;
    }
    onChange(LOCK_DEFAULT_USD);
  };

  const applyCustom = (raw: string) => {
    setCustom(raw);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= LOCK_MIN_PRICE && n <= LOCK_MAX_PRICE) onChange(Math.round(n * 100) / 100);
  };

  return (
    <div data-lock-control className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        // "On" is a fixed white pill: canvas themes restyle bg-primary (and
        // drop its fill inside some sheets), so the state vanished there.
        {...(on ? { 'data-keep-white': '', 'data-on-media': '' } : {})}
        style={on ? { background: '#ffffff', color: '#09090b', boxShadow: '0 0 0 1px rgba(0,0,0,0.12)' } : undefined}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
          on ? 'border-transparent' : 'border-white/15 bg-white/5 text-current hover:bg-white/10',
        )}
      >
        {on ? <Lock className="h-3 w-3" style={{ color: '#09090b', stroke: '#09090b' }} /> : <LockOpen className="h-3 w-3" />}
        {on
          ? t('dmPaidLock.lockOnUsd', { defaultValue: 'Locked · {{price}}', price: formatLockUsd(value) })
          : kind === 'video'
            ? t('dmPaidLock.lockVideo', 'Lock video')
            : t('dmPaidLock.lockPhoto', 'Lock photo')}
      </button>
      {on && (
        <>
          {LOCK_QUICK_PRICES.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => { setCustom(''); onChange(p); }}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs transition-colors',
                value === p && !custom ? 'bg-white/20 font-semibold ring-1 ring-current' : 'bg-white/5 hover:bg-white/10',
              )}
            >
              {formatLockUsd(p)}
            </button>
          ))}
          <label className="inline-flex w-[4.5rem] items-center rounded-full bg-white/5 px-2.5 py-1 text-xs focus-within:bg-white/10">
            <span className="opacity-60">$</span>
            <input
              inputMode="decimal"
              value={custom}
              onChange={e => applyCustom(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={t('dmPaidLock.lockCustom', 'Other')}
              aria-label={t('dmPaidLock.lockCustomUsdLabel', 'Custom price in dollars')}
              className="w-full min-w-0 bg-transparent pl-0.5 outline-none placeholder:opacity-50"
            />
          </label>
        </>
      )}
      {on && (
        <span data-lock-dhb className="basis-full text-[11px] font-medium opacity-80">
          {t('dmPaidLock.lockDhbNow', { defaultValue: '≈ {{dhb}} today. They always pay {{price}}, whatever DHB is worth.', dhb: formatLockDhb(lockDhbForUsd(value)), price: formatLockUsd(value) })}
        </span>
      )}
      {on && (
        <span className="basis-full text-[11px] opacity-60">
          {t('dmPaidLock.lockHint', 'They see it blurred until they pay you. Locked files are not end-to-end encrypted.')}
        </span>
      )}
    </div>
  );
}
