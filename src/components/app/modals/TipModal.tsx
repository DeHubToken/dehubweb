/**
 * Tip Modal Component
 * ===================
 * Drawer for tipping creators on posts or profiles.
 *
 * **It does not ask which network.** The first thing on screen when somebody
 * sends money should not be a question about infrastructure, and it was one
 * only their wallet could answer anyway. The tip leaves from whichever of Base
 * or BNB actually holds the amount, Base first, decided at send time. Anyone
 * who wants to pin a chain sets it once in Settings → Assets.
 *
 * Ethereum was on the old picker and is deliberately not in the automatic set:
 * DHB exists there, but the built-in wallet only signs as its **Safe** on Base
 * and BNB, so an Ethereum tip would arrive from the owner EOA — a different
 * backend account — and go uncredited.
 *
 * The balance shown is the larger of the two chains, because that is what the
 * "All" button can actually send.
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
import { getChainById, type ChainId } from '@/components/app/ChainSelector';
import { useTipPayment, MIN_TIP_DHB, MAX_TIP_DHB } from '@/hooks/use-tip-payment';
import { useTipNetwork } from '@/hooks/use-tip-network';
import { useAuth } from '@/contexts/AuthContext';
// NOTE: stream-controller and pay-chain reach wallet/contract code (wagmi +
// web3auth) and this modal is statically imported by eager feed cards — both
// are dynamically imported when the modal opens to keep the wallet stack out
// of the entry bundle (scripts/check-entry-bundle.mjs fails the build
// otherwise).
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';

const QUICK_AMOUNTS = [500, 1000, 5000, 10000, 25000, 50000, 100000, 1000000];

/** Chains a tip may be sent from automatically, in order. Base first, always. */
const AUTO_TIP_CHAINS: ChainId[] = [BASE_CHAIN_ID as ChainId, BNB_CHAIN_ID as ChainId];

interface TipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorAddress?: string;
  creatorName?: string;
  tokenId?: string;
  context?: string;
  /** Tipping a comment's author: recorded on the tip so the comment shows its
   *  own total, and kept out of the post's tip count. */
  commentId?: string;
}

export function TipModal({
  open,
  onOpenChange,
  creatorAddress,
  creatorName,
  tokenId,
  context,
  commentId,
}: TipModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  const [amount, setAmount] = useState('');
  const [balances, setBalances] = useState<Record<number, number> | null>(null);
  const [lastTipAmount, setLastTipAmount] = useState(0);
  const resolvedTokenId = tokenId || context;
  const { pinnedChainId } = useTipNetwork();

  const parsedAmount = parseAbbreviatedAmount(amount);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount >= MIN_TIP_DHB;

  // Base first, then BNB, then Base again as the place to fail — it is the one
  // chain the tipper can actually top up in-app. A pinned setting wins outright:
  // somebody who went to Settings to say "always BNB" meant it.
  const autoChainId = AUTO_TIP_CHAINS.find(id => (balances?.[id] ?? 0) >= parsedAmount);
  const tipChainId = pinnedChainId ?? autoChainId ?? (BASE_CHAIN_ID as ChainId);

  const { tip, isTipping } = useTipPayment({
    creatorAddress,
    chainId: tipChainId,
    tokenId: resolvedTokenId,
    commentId,
    onSuccess: () => {
      // Comment tips pay the comment's author, not the post — the post's
      // counter must not move for them.
      if (!commentId && resolvedTokenId && lastTipAmount > 0) {
        queryClient.cancelQueries({ queryKey: ['post-tip-count', resolvedTokenId] });
        queryClient.setQueryData(['post-tip-count', resolvedTokenId], (old: number | undefined) => (old || 0) + lastTipAmount);
        queryClient.invalidateQueries({ queryKey: ['post-tip-count', resolvedTokenId], refetchType: 'none' });
      }
      setAmount('');
      onOpenChange(false);
    },
    onConfirmed: () => {
      if (commentId && resolvedTokenId) {
        queryClient.invalidateQueries({ queryKey: ['comment-tips', resolvedTokenId] });
      } else if (resolvedTokenId) {
        queryClient.invalidateQueries({ queryKey: ['post-tip-count', resolvedTokenId] });
      }
    },
  });

  // Read once per open, both chains at a time. Keying this on the amount would
  // put an RPC round trip behind every keystroke; the pick above is pure and
  // re-derives from what is already here.
  useEffect(() => {
    if (!open || !walletAddress) return;
    let cancelled = false;
    import('@/lib/contracts/stream-controller')
      .then(m =>
        Promise.all(
          AUTO_TIP_CHAINS.map(id =>
            m.getDHBBalance(walletAddress, id).catch(() => BigInt(0)),
          ),
        ),
      )
      .then(raw => {
        if (cancelled) return;
        const next: Record<number, number> = {};
        AUTO_TIP_CHAINS.forEach((id, i) => {
          next[id] = Math.floor((Number(raw[i]) / 1e18) * 100) / 100;
        });
        setBalances(next);
      })
      .catch(() => { if (!cancelled) setBalances(null); });
    return () => { cancelled = true; };
  }, [open, walletAddress]);

  function parseAbbreviatedAmount(val: string): number {
    const trimmed = val.trim().toLowerCase();
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/);
    if (!match) return NaN;
    const num = parseFloat(match[1]);
    const suffix = match[2];
    if (suffix === 'k') return num * 1000;
    if (suffix === 'm') return num * 1000000;
    return num;
  }

  const chainName = getChainById(tipChainId)?.name ?? 'chain';
  // What "All" can actually send: the bigger of the two, since either is
  // reachable without the tipper doing anything.
  const dhbBalance = balances
    ? Math.max(...AUTO_TIP_CHAINS.map(id => balances[id] ?? 0))
    : null;

  const handleSendTip = () => {
    if (!isValidAmount) return;
    setLastTipAmount(parsedAmount);
    tip(parsedAmount);
  };

  const handleQuickAmount = (val: number) => setAmount(String(val));

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
            <p className="text-white/60 text-sm mt-1 text-center">
              {t('tip.toCreator', 'Tip {{name}}', { name: creatorName })}
            </p>
          )}
        </DrawerHeader>
        <div className="flex flex-col gap-4">
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
                  <span className="inline-flex items-center gap-1">
                    {val.toLocaleString()}{' '}
                    <img src={dehubCoin} alt="DHB" className="w-4 h-4" style={{ marginTop: '-1px' }} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/60 text-xs">{t('tip.customAmount', 'Or enter amount')}</p>
              {dhbBalance != null && (
                <p className="text-white/30 text-xs">
                  {dhbBalance.toLocaleString()} DHB · via {chainName}
                </p>
              )}
            </div>
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <img src={dehubCoin} alt="DHB" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 500, 1.5k, 2m"
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
              className="flex-1"
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
