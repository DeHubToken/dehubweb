/**
 * "Lock it" for a photo or video about to go out in a DM: off by default, one
 * tap shows quick prices, and the chosen price rides along with the send.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export const LOCK_QUICK_PRICES = [5, 25, 100];
export const LOCK_MIN_PRICE = 1;
export const LOCK_MAX_PRICE = 1_000_000;

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
    onChange(LOCK_QUICK_PRICES[1]);
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
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
          on ? 'border-transparent bg-primary text-primary-foreground' : 'border-white/15 bg-white/5 text-current hover:bg-white/10',
        )}
      >
        {on ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
        {on
          ? t('dmPaidLock.lockOnPrice', { defaultValue: 'Locked · {{price}} DHB', price: value })
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
                value === p && !custom ? 'bg-white/20 font-semibold' : 'bg-white/5 hover:bg-white/10',
              )}
            >
              {p}
            </button>
          ))}
          <input
            inputMode="decimal"
            value={custom}
            onChange={e => applyCustom(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder={t('dmPaidLock.lockCustom', 'Other')}
            aria-label={t('dmPaidLock.lockCustomLabel', 'Custom price in DHB')}
            className="w-16 rounded-full bg-white/5 px-2.5 py-1 text-xs outline-none placeholder:opacity-50 focus:bg-white/10"
          />
        </>
      )}
      {on && (
        <span className="basis-full text-[11px] opacity-60">
          {t('dmPaidLock.lockHint', 'They see it blurred until they pay you. Locked files are not end-to-end encrypted.')}
        </span>
      )}
    </div>
  );
}
