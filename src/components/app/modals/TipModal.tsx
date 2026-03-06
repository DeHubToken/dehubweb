/**
 * Tip Modal Component
 * ===================
 * Drawer for tipping creators on posts or profiles.
 * Supports quick amounts and custom input.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useTipPayment, MIN_TIP_DHB, MAX_TIP_DHB } from '@/hooks/use-tip-payment';
import dehubCoin from '@/assets/dehub-coin.png';

const QUICK_AMOUNTS = [500, 1000, 5000, 10000, 25000, 50000, 100000, 1000000];

interface TipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorAddress?: string;
  creatorName?: string;
  /** Optional context: post tokenId for analytics, or 'profile' */
  context?: string;
}

export function TipModal({
  open,
  onOpenChange,
  creatorAddress,
  creatorName,
  context,
}: TipModalProps) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const { tip, isTipping } = useTipPayment({
    creatorAddress,
    onSuccess: () => {
      setAmount('');
      onOpenChange(false);
    },
  });

  const parsedAmount = parseFloat(amount);
  const isValidAmount =
    !Number.isNaN(parsedAmount) && parsedAmount >= MIN_TIP_DHB && parsedAmount <= MAX_TIP_DHB;

  const handleSendTip = () => {
    if (!isValidAmount) return;
    tip(parsedAmount);
  };

  const handleQuickAmount = (val: number) => {
    setAmount(String(val));
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-6">
        <DrawerHeader className="pb-3">
          <DrawerTitle className="text-white text-lg flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-400" />
            {t('tip.title', 'Send Tip')}
          </DrawerTitle>
          {creatorName && (
            <p className="text-white/60 text-sm mt-1">
              {t('tip.toCreator', 'Tip {{name}}', { name: creatorName })}
            </p>
          )}
        </DrawerHeader>
        <div className="flex flex-col gap-4">
          {/* Quick amounts */}
          <div>
            <p className="text-white/60 text-xs mb-2">{t('tip.quickAmounts', 'Quick amounts')}</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    amount === String(val)
                      ? 'bg-amber-500/30 text-amber-400 border border-amber-500/50'
                      : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {val} DHB
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <p className="text-white/60 text-xs mb-2">{t('tip.customAmount', 'Or enter amount')}</p>
            <div className="relative">
              <img
                src={dehubCoin}
                alt="DHB"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
              />
              <Input
                type="number"
                min={MIN_TIP_DHB}
                max={MAX_TIP_DHB}
                step={0.1}
                placeholder={`${MIN_TIP_DHB} - ${MAX_TIP_DHB} DHB`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-11 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <LiquidGlassBubble
              shimmer={false}
              className="flex-1 cursor-pointer"
              onClick={isTipping ? undefined : () => onOpenChange(false)}
            >
              <span className="block text-center text-white text-sm font-medium">
                {t('common.close', 'Close')}
              </span>
            </LiquidGlassBubble>
            <Button
              variant="glass"
              className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30"
              onClick={handleSendTip}
              disabled={isTipping || !isValidAmount}
            >
              {isTipping ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('tip.sending', 'Sending...')}
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 mr-2" />
                  {t('tip.sendAmount', 'Send {{amount}} DHB', {
                    amount: isValidAmount ? parsedAmount : '—',
                  })}
                </>
              )}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
