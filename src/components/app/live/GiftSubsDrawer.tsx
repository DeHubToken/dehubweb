/**
 * Gift subscriptions from a live stream: one of the creator's plans for a
 * named person, or for N people picked at random from the stream's chat.
 *
 * The same three legs as subscribing yourself — the API fixes the recipients
 * and the price, the wallet sends the DHB, the API reads the transfer off the
 * chain and only then grants them — so a gift is never granted unpaid and a
 * paid one is never lost to a dropped confirmation.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'ethers';
import { Loader2 } from 'lucide-react';
import Gift from '@/components/ui/cut-icons/gifts';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreatorPlans } from '@/hooks/use-subscriptions';
import { isPlanPublished, planPrice, type SubscriptionPlan } from '@/lib/api/dehub/subscriptions';
import {
  clearPendingGift,
  confirmSubscriptionGift,
  quoteSubscriptionGift,
  rememberPendingGift,
  type GiftResult,
} from '@/lib/api/dehub/live-hype';
import { toastTxError } from '@/lib/tx-error-toast';
import { BASE_CHAIN_ID } from '@/lib/contracts';
import type { ChainId } from '@/components/app/ChainSelector';
import { cn } from '@/lib/utils';

const COUNTS = [1, 5, 10, 20, 50, 100] as const;

type Stage = 'idle' | 'preparing' | 'wallet' | 'confirming' | 'recording';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorAddress: string;
  creatorName?: string;
  /** The live stream random gifts go to. */
  streamId?: string | null;
}

export function GiftSubsDrawer({ open, onOpenChange, creatorAddress, creatorName, streamId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { plans, isLoading } = useCreatorPlans(creatorAddress, open);
  const buyable = useMemo(() => plans.filter((p) => isPlanPublished(p) && p.isActive !== false), [plans]);
  const [planId, setPlanId] = useState<string | null>(null);
  const plan: SubscriptionPlan | undefined = buyable.find((p) => String(p.id || p._id) === planId) ?? buyable[0];
  const [mode, setMode] = useState<'random' | 'user'>(streamId ? 'random' : 'user');
  const [count, setCount] = useState<number>(5);
  const [recipient, setRecipient] = useState('');
  const [stage, setStage] = useState<Stage>('idle');

  const unit = plan ? planPrice(plan) ?? 0 : 0;
  const n = mode === 'random' ? count : 1;

  const gift = useMutation({
    mutationFn: async (): Promise<GiftResult> => {
      if (!plan) throw new Error(t('liveHype.gift.noPlan'));
      setStage('preparing');
      const quote = await quoteSubscriptionGift(
        String(plan.id || plan._id),
        mode === 'random' ? { count, streamId: streamId || '' } : { recipient: recipient.trim() },
      );
      if (!quote.giftId || !quote.dhbToken || !quote.treasuryAddress) throw new Error(t('liveHype.gift.notReady'));
      if (quote.mode === 'random' && quote.count < quote.requested) {
        toast.info(t('liveHype.gift.fewer', { count: quote.count }));
      }
      const chainId = (quote.chainId || BASE_CHAIN_ID) as ChainId;
      setStage('wallet');
      const { sendERC20Token } = await import('@/lib/wallet/send');
      const tx = await sendERC20Token(quote.dhbToken, quote.treasuryAddress, formatUnits(BigInt(quote.dhbAmountWei), 18), 18, chainId);
      setStage('confirming');
      await tx.wait();
      setStage('recording');
      rememberPendingGift({ giftId: quote.giftId, hash: tx.hash, chainId });
      // The API reads the chain, which can lag the receipt by a block or two.
      let result: GiftResult | null = null;
      for (let attempt = 0; attempt < 5 && !result; attempt++) {
        try {
          result = await confirmSubscriptionGift(quote.giftId, tx.hash, chainId);
        } catch (err: any) {
          if (attempt === 4 || !/not visible|pending/i.test(String(err?.message || ''))) throw err;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      clearPendingGift(quote.giftId);
      return result!;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast.success(t('liveHype.gift.done', { count: result.granted || result.count }));
      onOpenChange(false);
    },
    onError: (err: Error) => toastTxError(err, t('liveHype.gift.failed'), { context: 'subscribe' }),
    onSettled: () => setStage('idle'),
  });

  const busy = gift.isPending;
  const canSend = !!plan && !busy && (mode === 'random' ? !!streamId : recipient.trim().length > 1);
  const stageLabel = stage === 'idle' ? '' : t(`liveHype.gift.stage.${stage}`);

  return (
    <Drawer open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DrawerContent column glass className="px-4 pb-8 max-h-[85dvh]">
        <DrawerHeader className="border-b border-white/10 mb-4">
          <DrawerTitle className="text-white flex items-center gap-2">
            <Gift className="w-5 h-5" />
            {t('liveHype.gift.title')}
          </DrawerTitle>
        </DrawerHeader>
        <div data-vaul-no-drag className="space-y-4 min-h-0 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : !buyable.length ? (
            <p className="text-sm text-zinc-400">{t('liveHype.gift.noPlans', { name: creatorName || t('liveOverlay.someone') })}</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm text-zinc-400">{t('liveHype.gift.plan')}</p>
                <div className="grid gap-2">
                  {buyable.map((p) => {
                    const id = String(p.id || p._id);
                    const selected = plan && String(plan.id || plan._id) === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={!!selected}
                        onClick={() => setPlanId(id)}
                        className={cn(
                          'flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm',
                          selected ? 'border-white/60 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10',
                        )}
                      >
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="shrink-0 tabular-nums">${(planPrice(p) ?? 0).toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
                {(['random', 'user'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    disabled={m === 'random' && !streamId}
                    onClick={() => setMode(m)}
                    className={cn(
                      'rounded-lg px-2 py-2 text-xs font-medium disabled:opacity-40',
                      mode === m ? 'bg-white text-zinc-900' : 'text-zinc-300 hover:text-white',
                    )}
                  >
                    {t(`liveHype.gift.mode.${m}`)}
                  </button>
                ))}
              </div>

              {mode === 'random' ? (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-400">{t('liveHype.gift.howMany')}</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {COUNTS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={count === c}
                        onClick={() => setCount(c)}
                        className={cn(
                          'rounded-lg border py-2 text-sm font-semibold tabular-nums',
                          count === c ? 'border-white/60 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-zinc-300',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500">{t('liveHype.gift.randomHint')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="gift-sub-recipient" className="text-sm text-zinc-400">
                    {t('liveHype.gift.who')}
                  </label>
                  <Input
                    id="gift-sub-recipient"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value.slice(0, 64))}
                    placeholder={t('liveHype.gift.whoPlaceholder')}
                    autoComplete="off"
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  />
                </div>
              )}

              <Button
                onClick={() => gift.mutate()}
                disabled={!canSend}
                className="w-full bg-white hover:bg-zinc-200 text-black py-5 font-semibold rounded-xl"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gift className="w-4 h-4 mr-2" />}
                {busy ? stageLabel : t('liveHype.gift.send', { count: n, price: (unit * n).toFixed(2) })}
              </Button>
              <p className="text-[11px] text-zinc-500">{t('liveHype.gift.payHint')}</p>
            </>
          )}
          <Button variant="glass" className="w-full py-5 rounded-xl" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('liveHype.gift.cancel')}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
