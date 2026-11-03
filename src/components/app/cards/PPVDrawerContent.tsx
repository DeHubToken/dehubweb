/**
 * PPV Drawer Content Component
 * ============================
 * Reusable PPV drawer body with Close and Pay buttons.
 *
 * Too little DHB is handled here rather than thrown away: the same sheet turns
 * into a top-up step, and the unlock resumes on its own the moment the wallet
 * is funded, so the viewer never has to find their way back to the post.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Ticket, Loader2, Check } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import X from "@/components/ui/cut-icons/close";

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { usePPVPayment } from '@/hooks/use-ppv-payment';
import { PPVTopUpStep } from './PPVTopUpStep';
import { DhbAmount } from '@/components/app/DhbAmount';
import {
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface PPVDrawerContentProps {
  tokenId: string;
  price: number;
  currency?: string;
  creatorAddress?: string;
  chainId?: number;
  onClose: () => void;
  onUnlocked?: () => void;
  formatCompact: (num: number) => string;
}

export function PPVDrawerContent({
  tokenId,
  price,
  currency = 'DHB',
  creatorAddress,
  chainId,
  onClose,
  onUnlocked,
  formatCompact,
}: PPVDrawerContentProps) {
  const { t } = useTranslation();
  // Phones: a short tick in the sheet, then it closes itself and the post plays its reveal.
  const isMobile = useIsMobile();
  const [done, setDone] = useState(false);
  const { pay, isPaying, shortfall, clearShortfall } = usePPVPayment({
    tokenId,
    creatorAddress,
    price,
    currency,
    // Passed through unnarrowed: Solana posts carry 101/103 and the hook
    // routes those to the SOL/SPL transfer path.
    chainId,
    onSuccess: () => {
      if (!isMobile) {
        onUnlocked?.();
        onClose();
        return;
      }
      toast.dismiss('ppv-payment');
      setDone(true);
      setTimeout(() => {
        onClose();
        setTimeout(() => onUnlocked?.(), 250);
      }, 800);
    },
  });

  return (
    <DrawerContent
      column
      glass
      scrollable
      className="max-h-[85dvh] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      {!done && (
      <DrawerHeader className="pb-3 relative">
        <DrawerTitle className="text-white text-lg flex items-center gap-2">
          <Ticket className="w-5 h-5 text-white" />
          {shortfall
            ? t('drawers.ppvTopUpTitle', 'Top up to unlock')
            : t('drawers.ppvTitle')}
        </DrawerTitle>
        <button onClick={onClose} className="absolute top-3 right-0 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </DrawerHeader>
      )}
      {done ? (
        <div className="flex flex-col items-center gap-2 py-8 text-white" data-unlock-sheet="done">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-current text-white animate-in zoom-in-50 duration-300">
            <Check className="h-7 w-7" strokeWidth={2.6} />
          </span>
          <p className="text-lg font-semibold">{t('dmPaidLock.sheetUnlocked', 'Unlocked')}</p>
          <p className="text-sm text-white/65">{t('drawers.ppvOpening', 'Opening the post…')}</p>
        </div>
      ) : shortfall ? (
        <PPVTopUpStep
          shortfall={shortfall}
          formatCompact={formatCompact}
          // Funded, so send the unlock immediately — pay() clears the
          // shortfall itself and the sheet flips back to its paying state.
          onFunded={pay}
          onCancel={clearShortfall}
          onClose={onClose}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
            <span className="text-white text-sm">{t('drawers.unlockPrice')}</span>
            <span className="text-white text-lg font-bold">
              <DhbAmount
                amount={formatCompact(Number(price))}
                currency={currency}
                iconClassName="h-5 w-5"
              />
            </span>
          </div>
          <div className="flex gap-3 mt-2">
            <Button
              variant="glass"
              className="flex-1"
              onClick={onClose}
              disabled={isPaying}
            >
              {t('common.close', 'Close')}
            </Button>
            <Button
              variant="glass"
              className="flex-1"
              onClick={pay}
              disabled={isPaying}
            >
              {isPaying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('drawers.paying', 'Paying...')}
                </>
              ) : (
                t('drawers.payAmount', 'Pay {{amount}} {{currency}}', {
                  amount: formatCompact(Number(price)),
                  currency: currency || 'DHB',
                })
              )}
            </Button>
          </div>
        </div>
      )}
    </DrawerContent>
  );
}
