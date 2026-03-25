/**
 * Tip Modal Component
 * ===================
 * Drawer for tipping creators on posts or profiles.
 * Supports quick amounts and custom input.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Gem, Loader2 } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useTipPayment, MIN_TIP_DHB, MAX_TIP_DHB } from '@/hooks/use-tip-payment';
import { useAuth } from '@/contexts/AuthContext';
import { getDHBBalance } from '@/lib/contracts/stream-controller';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';


const QUICK_AMOUNTS = [500, 1000, 5000, 10000, 25000, 50000, 100000, 1000000];

interface TipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorAddress?: string;
  creatorName?: string;
  /** Post tokenId for per-post tip tracking */
  tokenId?: string;
  /** @deprecated Use tokenId instead */
  context?: string;
}

export function TipModal({
  open,
  onOpenChange,
  creatorAddress,
  creatorName,
  tokenId,
  context,
}: TipModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  const [amount, setAmount] = useState('');
  const [dhbBalance, setDhbBalance] = useState<number | null>(null);
  const resolvedTokenId = tokenId || context;
  const { tip, isTipping } = useTipPayment({
    creatorAddress,
    tokenId: resolvedTokenId,
    onSuccess: () => {
      setAmount('');
      onOpenChange(false);
      if (resolvedTokenId) {
        queryClient.invalidateQueries({ queryKey: ['post-tip-count', resolvedTokenId] });
      }
    },
  });

  // Fetch user's DHB balance when drawer opens
  useEffect(() => {
    if (open && walletAddress) {
      getDHBBalance(walletAddress, BASE_CHAIN_ID)
        .then((raw) => {
          const human = Number(raw) / 1e18;
          setDhbBalance(Math.floor(human * 100) / 100);
        })
        .catch(() => setDhbBalance(null));
    }
  }, [open, walletAddress]);

  const parsedAmount = parseFloat(amount);
  const isValidAmount =
    !Number.isNaN(parsedAmount) && parsedAmount >= MIN_TIP_DHB;

  const handleSendTip = () => {
    if (!isValidAmount) return;
    tip(parsedAmount);
  };

  const handleQuickAmount = (val: number) => {
    setAmount(String(val));
  };

  const handleAll = () => {
    if (dhbBalance != null && dhbBalance >= MIN_TIP_DHB) {
      setAmount(String(Math.floor(dhbBalance)));
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-6">
        <DrawerHeader className="pb-3">
          <DrawerTitle className="text-white text-lg flex items-center justify-center gap-2">
            <Gem className="w-5 h-5 text-white" />
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
                  <span className="inline-flex items-center gap-1">{val.toLocaleString()} <img src={dehubCoin} alt="DHB" className="w-4 h-4" style={{ marginTop: '-1px' }} /></span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/60 text-xs">{t('tip.customAmount', 'Or enter amount')}</p>
              {dhbBalance != null && (
                <p className="text-white/30 text-xs">
                  Balance: {dhbBalance.toLocaleString()} DHB
                </p>
              )}
            </div>
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <img src={dehubCoin} alt="DHB" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" />
                <Input
                  type="number"
                  min={MIN_TIP_DHB}
                  step={0.1}
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-11 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12 rounded-xl"
                />
              </div>
              <button
                type="button"
                onClick={handleAll}
                disabled={dhbBalance == null || dhbBalance < MIN_TIP_DHB}
                className="h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                All
              </button>
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <Button
              variant="glass"
              className="flex-1"
              onClick={isTipping ? undefined : () => onOpenChange(false)}
              disabled={isTipping}
            >
              {t('common.close', 'Close')}
            </Button>
            <Button
              variant="glass"
              className="flex-1 bg-yellow-500/25 hover:bg-yellow-500/35 border-yellow-500/40 text-yellow-300"
              onClick={handleSendTip}
              disabled={isTipping || !isValidAmount}
            >
              {isTipping ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('tip.sending', 'Sending...')}
                </>
              ) : (
                t('tip.send', 'Send')
              )}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
