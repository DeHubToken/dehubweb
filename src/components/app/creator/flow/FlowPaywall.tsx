/**
 * Creator Flow — confirm a run and pay for it in one transfer.
 * ============================================================
 * Every paid node in the run is listed with the price the server quoted; the
 * total is signed once as a DHB transfer and the receipt is spent down job by
 * job. Nothing reaches a provider before the transfer confirms, and a node
 * that fails releases its share back onto the receipt.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DhbCoin } from '@/components/app/DhbAmount';
import { formatDhb } from '@/hooks/use-ai-quote';
import { useSpendableDhb } from '@/lib/ai-payment';
import { payForPlan, type RunPlan } from '@/lib/creator/flow/runner';

interface Props {
  plan: RunPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the transfer hash (undefined for a free run). */
  onConfirm: (txHash: string | undefined) => void;
}

export default function FlowPaywall({ plan, open, onOpenChange, onConfirm }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const { walletDhb, isLoading: walletLoading } = useSpendableDhb();

  const total = plan?.totalDhb ?? 0;
  const paid = plan?.items.filter((i) => i.priceDhb > 0) ?? [];
  const free = plan?.items.filter((i) => i.priceDhb === 0) ?? [];
  const needsTokens = !walletLoading && total > 0 && walletDhb < total;

  async function confirm() {
    if (!plan) return;
    if (needsTokens) {
      onOpenChange(false);
      navigate('/app/buy');
      return;
    }
    setPaying(true);
    try {
      let txHash: string | undefined;
      if (total > 0) {
        toast.loading(t('creatorFlow.paying', { amount: formatDhb(total) }), { id: 'flow-run-payment' });
        txHash = await payForPlan(plan);
        toast.success(t('creatorFlow.paymentConfirmed'), { id: 'flow-run-payment' });
      }
      onConfirm(txHash);
    } catch (e) {
      toast.dismiss('flow-run-payment');
      toast.error(e instanceof Error ? e.message : t('creatorFlow.paymentFailed'));
    } finally {
      setPaying(false);
    }
  }

  return (
    // Locked while a transfer is in flight: closing mid-payment would drop the hash.
    <Dialog open={open} onOpenChange={(next) => { if (!paying) onOpenChange(next); }}>
      <DialogContent className="max-w-md border border-white/10 bg-zinc-950/90 text-white shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>{t('creatorFlow.runTitle', { count: plan?.items.length ?? 0 })}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {total > 0 ? t('creatorFlow.runDescriptionPaid') : t('creatorFlow.runDescriptionFree')}
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {paid.map((item) => (
            <li key={item.nodeId} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px]">
              <span className="truncate">
                <span className="font-medium">{item.label}</span>
                <span className="text-zinc-500"> · {item.modelName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-white">
                {formatDhb(item.priceDhb)} <DhbCoin />
              </span>
            </li>
          ))}
          {free.length > 0 && (
            <li className="px-1 pt-1 text-[12px] text-zinc-500">
              {t('creatorFlow.freeNodes', { count: free.length })}
            </li>
          )}
        </ul>

        {total > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-[13px] text-zinc-300">{t('creatorFlow.total')}</span>
            <span className="flex items-center gap-1.5 text-[15px] font-semibold">
              {formatDhb(total)} <DhbCoin />
            </span>
          </div>
        )}

        {total > 0 && !walletLoading && (
          <p className="text-[12px] text-zinc-400">
            {needsTokens
              ? t('creatorFlow.notEnoughDhb', { have: formatDhb(walletDhb), need: formatDhb(total) })
              : t('creatorFlow.walletHolds', { amount: formatDhb(walletDhb) })}
          </p>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={paying || !plan}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 text-[14px] font-semibold text-white backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20 disabled:opacity-50"
        >
          {paying && <Loader2 className="h-4 w-4 animate-spin" />}
          {needsTokens ? t('creatorFlow.buyDhb') : total > 0 ? t('creatorFlow.payAndRun') : t('creatorFlow.run')}
        </button>
      </DialogContent>
    </Dialog>
  );
}
