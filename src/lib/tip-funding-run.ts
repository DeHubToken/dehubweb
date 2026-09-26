/**
 * The toast-driven wrapper every DHB payment surface (tips, gifts, PPV,
 * subscriptions, DM tips) calls before paying when the payer picked another
 * token. Kept free of wallet imports — lib/tip-funding is loaded on first
 * use — so eager feed cards do not pull the wallet stack into the entry bundle.
 */
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import type { TipFundingSource, TipFundingStage } from '@/lib/tip-funding';
import { fundingErrorText } from '@/lib/tip-funding-error';

const CHAIN_NAMES: Record<number, string> = { 8453: 'Base', 5042: 'Arc', 1: 'Ethereum', 56: 'BNB Chain', 4663: 'Robinhood Chain' };

/**
 * Turn `source` into enough DHB on Base for a tip of `amountDhb`. Resolves
 * true when the tip can be sent; false after showing why it cannot. Uses the
 * tip's own toast id so the whole payment reads as one progressing message.
 */
export async function fundTipFromSource(
  source: TipFundingSource,
  amountDhb: number,
  walletAddress: string,
  t: TFunction,
  /** One toast carries the whole payment; pass the surface's own id when it has one. */
  toastId = 'tip-payment',
): Promise<boolean> {
  const vars = { symbol: source.symbol, chain: CHAIN_NAMES[source.chainId] ?? '' };
  const label: Record<TipFundingStage, string> = {
    quote: t('tip.payQuoting', 'Getting the best price…'),
    approve: t('tip.stageApprove', 'Approving {{symbol}}…', vars),
    bridge: t('tip.stageBridge', 'Sending {{symbol}} from {{chain}}…', vars),
    arriving: t('tip.stageArriving', 'Arriving on Base, usually a few seconds…'),
    pay: t('tip.stagePay', 'Paying DeHub Pay with {{symbol}}…', vars),
    delivering: t('tip.stageDelivering', 'DeHub Pay is sending your DHB…'),
    swap: t('tip.stageSwap', 'Buying DHB on Uniswap…'),
  };
  try {
    const { fundTip } = await import('@/lib/tip-funding');
    await fundTip({
      source,
      amountDhb,
      walletAddress,
      onStage: stage => toast.loading(label[stage], { id: toastId }),
    });
    return true;
  } catch (error) {
    const aa = await import('@/lib/contracts/aa-utils').catch(() => null);
    if (aa?.isWalletLockedError(error)) {
      toast.dismiss(toastId);
      return false;
    }
    const message = fundingErrorText(t, error);
    toast.error(message || t('tip.payFailed', 'Could not convert {{symbol}} to DHB', vars), { id: toastId, duration: 8000 });
    return false;
  }
}
