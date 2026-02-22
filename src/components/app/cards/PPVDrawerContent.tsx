/**
 * PPV Drawer Content Component
 * ============================
 * Reusable PPV drawer body with Close and Pay buttons.
 */

import { Ticket, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { usePPVPayment } from '@/hooks/use-ppv-payment';
import type { ChainId } from '@/components/app/ChainSelector';
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
  const { pay, isPaying } = usePPVPayment({
    tokenId,
    creatorAddress,
    price,
    currency,
    chainId: chainId as ChainId,
    onSuccess: () => {
      onUnlocked?.();
      onClose();
    },
  });

  return (
    <DrawerContent glass className="px-4 pb-6">
      <DrawerHeader className="pb-3">
        <DrawerTitle className="text-white text-lg flex items-center gap-2">
          <Ticket className="w-5 h-5 text-white" />
          {t('drawers.ppvTitle')}
        </DrawerTitle>
      </DrawerHeader>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
          <span className="text-white text-sm">{t('drawers.unlockPrice')}</span>
          <span className="text-white text-lg font-bold">
            {formatCompact(Number(price))} {currency || 'USDC'}
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
    </DrawerContent>
  );
}
