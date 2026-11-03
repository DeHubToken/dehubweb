/**
 * The confirm step before paying to open something, used on phones.
 *
 * Price first, who gets paid, Close or Pay. Paying and confirming show on the
 * Pay button itself rather than as toasts, then a short tick, then the caller
 * closes the sheet and plays the reveal on the item.
 */
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Ticket } from 'lucide-react';
import X from '@/components/ui/cut-icons/close';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

export type UnlockPhase = 'idle' | 'paying' | 'confirming' | 'done';

interface UnlockConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  who: string;
  sub: string;
  previewUrl?: string;
  priceLabel: string;
  dhbLabel: string;
  phase: UnlockPhase;
  doneLabel: string;
  onPay: () => void;
}

export function UnlockConfirmSheet({
  open, onOpenChange, title, who, sub, previewUrl, priceLabel, dhbLabel, phase, doneLabel, onPay,
}: UnlockConfirmSheetProps) {
  const { t } = useTranslation();
  const busy = phase === 'paying' || phase === 'confirming';
  return (
    <Drawer open={open} onOpenChange={o => { if (!busy) onOpenChange(o); }}>
      <DrawerContent column glass className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]" data-unlock-sheet={phase}>
        {phase === 'done' ? (
          <div className="flex flex-col items-center gap-2 py-8 text-white">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-current text-white animate-in zoom-in-50 duration-300">
              <Check className="h-7 w-7" strokeWidth={2.6} />
            </span>
            <p className="text-lg font-semibold">{t('dmPaidLock.sheetUnlocked', 'Unlocked')}</p>
            <p className="text-sm text-white/65">{doneLabel}</p>
          </div>
        ) : (
          <>
            <DrawerHeader className="pb-3 relative">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Ticket className="w-5 h-5 text-white" />
                {title}
              </DrawerTitle>
              <button
                type="button"
                onClick={() => !busy && onOpenChange(false)}
                aria-label={t('common.close', 'Close')}
                className="absolute top-3 right-0 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </DrawerHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 flex-none overflow-hidden rounded-lg bg-zinc-800">
                  {previewUrl && <img src={previewUrl} alt="" aria-hidden className="h-full w-full scale-125 object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{who}</p>
                  <p className="truncate text-xs text-white/60">{sub}</p>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
                <span className="text-white text-sm">{t('drawers.unlockPrice', 'Price')}</span>
                <span className="text-white text-lg font-bold">
                  {priceLabel}
                  <span className="ml-1.5 text-xs font-medium text-white/60">{dhbLabel}</span>
                </span>
              </div>
              <div className="flex gap-3 mt-1">
                <Button variant="glass" className="flex-1" onClick={() => onOpenChange(false)} disabled={busy}>
                  {t('common.close', 'Close')}
                </Button>
                <Button variant="glass" className="flex-1" onClick={onPay} disabled={busy} data-unlock-pay>
                  {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {phase === 'paying'
                    ? t('dmPaidLock.sheetPaying', 'Paying')
                    : phase === 'confirming'
                      ? t('dmPaidLock.sheetConfirming', 'Confirming')
                      : t('dmPaidLock.sheetPay', { defaultValue: 'Pay {{price}}', price: priceLabel })}
                </Button>
              </div>
              <p className="min-h-[1rem] text-center text-xs text-white/60" aria-live="polite">
                {phase === 'paying'
                  ? t('dmPaidLock.sheetPayingLine', { defaultValue: 'Paying {{dhb}}…', dhb: dhbLabel.replace(/^≈\s*/, '') })
                  : phase === 'confirming'
                    ? t('dmPaidLock.lockedConfirming', 'Confirming payment…')
                    : ''}
              </p>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

export default UnlockConfirmSheet;
