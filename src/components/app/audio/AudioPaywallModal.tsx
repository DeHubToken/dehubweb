/**
 * Audio generation paywall.
 * =========================
 * Only three of the nine audio tools reach this: music, voice changer and
 * dubbing. The other six cost a fraction of a cent a run and stay free, the
 * same way the editor's voiceover button always has — see the note in
 * audio-models.constants.ts.
 *
 * The payment sequence is copied from Model3dPaywallModal deliberately, and
 * must stay that way. It carries fixes that were paid for in real money: the
 * receipt status is checked (a reverted transfer resolves rather than throws,
 * so skipping it hands out free generations), the loading toast is dismissed on
 * every early return, and the drawer cannot be closed mid-transfer.
 *
 * ── Metered, unlike the other paywalls ───────────────────────────────────────
 * Image and 3D charge per generation. These three charge per unit of LENGTH,
 * and the length is known before the call: the creator picks it for music, and
 * the composer reads it off the upload for the other two. `units` arrives
 * already computed so the number on the button is the number that is charged.
 *
 * ── The hash is the point ────────────────────────────────────────────────────
 * This used to move DHB and then call onConfirm() with nothing, so the transfer
 * was real but no function ever checked it had happened — calling the endpoint
 * directly skipped the whole drawer. The hash now travels to the generation
 * function, which verifies it on chain.
 *
 * A task whose spec carries `quoteModelId` is priced by the SERVER, so the
 * number on the button is the number the function will charge. Without one the
 * task falls back to the local estimate: it is not server-charged yet, and a
 * quote it cannot pay against would only invent a disagreement.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DhbAmount, DhbCoin } from '@/components/app/DhbAmount';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertCircle, Lightbulb, Music2 } from 'lucide-react';
import {
  getAudioCostDhb,
  getAudioCostUsd,
  type AudioTaskSpec,
} from '@/constants/audio-models.constants';
import { supabase } from '@/integrations/supabase/client';
import dhbCoinImage from '@/assets/dehub-coin.png';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { toast } from 'sonner';
import { toastTxError } from '@/lib/tx-error-toast';
import { payForJob } from '@/lib/ai-payment';
import { useJobQuote } from '@/hooks/use-ai-quote';

interface AudioPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: AudioTaskSpec;
  /** Billable units, already computed from the chosen length or the upload. */
  units: number;
  /** Human summary of what is being charged for, e.g. "60s track". */
  quantityLabel: string;
  /**
   * The confirmed transfer. Pass it to the generation function as `txHash` —
   * that is what proves the payment happened to the endpoint that spends it.
   */
  onConfirm: (txHash: string) => void;
}

export function AudioPaywallModal({
  open,
  onOpenChange,
  spec,
  units,
  quantityLabel,
  onConfirm,
}: AudioPaywallModalProps) {
  const { t } = useTranslation();
  const [dhbPrice, setDhbPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const { walletAddress } = useAuth();
  const { data: profile } = useDeHubProfile({
    userId: walletAddress || undefined,
    enabled: !!walletAddress,
  });
  const userBalance = profile?.badgeBalance ?? 0;

  useEffect(() => {
    if (open) void fetchDhbPrice();
  }, [open]);

  const fetchDhbPrice = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('get-dhb-price');
      if (fetchError) throw fetchError;
      const price = data?.prices?.DHB;
      if (!price) throw new Error(t('creator.dhbPriceFailed'));
      setDhbPrice(price);
    } catch (err) {
      console.error('Error fetching DHB price:', err);
      setError(t('creator.dhbPriceFallback'));
      setDhbPrice(0.0006191);
    } finally {
      setLoading(false);
    }
  };

  // Server quote where the function actually charges, local estimate where it
  // does not yet. Only the quoted price is authoritative — it is produced by
  // the same table the endpoint prices from, so the two cannot drift.
  const quote = useJobQuote(
    spec.quoteModelId ? { kind: 'tool', modelId: spec.quoteModelId, quantity: units } : null,
    open,
  );

  const isQuoted = !!spec.quoteModelId;
  const costUsd = isQuoted ? quote.priceUsd : getAudioCostUsd(spec, units);
  const costDhb = isQuoted
    ? quote.priceDhb
    : dhbPrice
      ? getAudioCostDhb(spec, dhbPrice, units)
      : 0;
  // A quoted task waits on the quote, not on the DHB spot price — showing a
  // stale local estimate while the real number is still in flight would put a
  // figure on the button that is not the one being charged.
  const isPriceLoading = isQuoted ? quote.isLoading : loading;
  // A quote that failed leaves the button disabled at 0 DHB, so it has to say
  // why — the local path's fallback price means its own error is only ever a
  // warning, but a missing quote is the whole reason nothing can be paid.
  const shownError = isQuoted ? quote.error : error;
  const hasEnoughBalance = userBalance >= costDhb;

  const formatDhb = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  const handlePayAndGenerate = async () => {
    if (costDhb <= 0) return;
    setIsPaying(true);
    try {
      toast.loading(t('creator.processingPayment'), { id: 'audio-gen-payment' });
      // payForJob is the shared path the 3D paywall uses, and it carries the
      // things this drawer's own copy had drifted away from: a bounded chain
      // switch, the receipt status check, and reuse of a transfer that was paid
      // for a generation that then never ran.
      const txHash = await payForJob(costDhb);
      toast.success(t('creator.paymentConfirmed'), { id: 'audio-gen-payment' });
      onConfirm(txHash);
    } catch (err: unknown) {
      console.error('[AudioPaywall] Payment failed:', err);
      toast.dismiss('audio-gen-payment');
      toastTxError(err, t('creator.paymentFailed'));
    } finally {
      setIsPaying(false);
    }
  };

  return (
    // Locked while paying: dismissing mid-transfer only unmounts the UI, it
    // cannot recall the on-chain transfer, and the generation would be lost
    // with the money already gone.
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next && isPaying) return;
        onOpenChange(next);
      }}
    >
      <DrawerContent column glass hideHandle={false} className="max-h-[85vh]">
        <DrawerHeader className="text-left pb-2">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Music2 className="w-5 h-5 text-cyan-400" />
            {t(spec.labelKey)}
          </DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            {t('creator.confirmPaymentToStart')}
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-4">
          <div className="space-y-3 pb-4">
            <div className="rounded-xl bg-zinc-800/50 p-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{spec.emoji}</span>
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm">{t(spec.labelKey)}</p>
                  <p className="text-xs text-zinc-500">{t(spec.descriptionKey)}</p>
                </div>
              </div>
            </div>

            {!!spec.tips?.length && (
              <div className="rounded-xl bg-zinc-800/30 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                  {t('creator.tips')}
                </p>
                <ul className="space-y-1">
                  {spec.tips.map((tip) => (
                    <li key={tip} className="text-xs leading-relaxed text-zinc-400">
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl bg-zinc-800/50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{t('creator.length')}</span>
                <span className="font-medium text-white">{quantityLabel}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-400">{t('creator.estimatedTime')}</span>
                <span className="font-medium text-white">{spec.typicalDuration}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-700/60 pt-2 text-sm">
                <span className="text-zinc-400">{t('creator.total')}</span>
                <span className="flex items-center gap-1.5 font-semibold text-white">
                  <img src={dhbCoinImage} alt="" className="h-4 w-4" />
                  {isPriceLoading ? '…' : formatDhb(costDhb)}
                  <span className="text-xs font-normal text-zinc-500">
                    (${costUsd.toFixed(2)})
                  </span>
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">{t('creator.yourBalance')}</span>
                <span className={hasEnoughBalance ? 'text-zinc-400' : 'text-red-400'}>
                  {formatDhb(userBalance)} <DhbCoin />
                </span>
              </div>
            </div>

            {shownError && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {shownError}
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 pt-2">
          <Button
            onClick={() => void handlePayAndGenerate()}
            disabled={isPriceLoading || isPaying || !hasEnoughBalance || costDhb <= 0}
            className="w-full"
          >
            {isPaying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('creator.processing')}
              </>
            ) : hasEnoughBalance ? (
              <>
                {t('creator.payAction')} <DhbAmount amount={formatDhb(costDhb)} />
              </>
            ) : (
              t('creator.insufficientDhb')
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
