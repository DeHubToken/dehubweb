/**
 * The toast-driven wrapper both tip surfaces call before `tip()` when the
 * tipper pays with something other than DHB. Kept free of wallet imports —
 * lib/tip-funding is loaded on first use — so the eager feed cards that import
 * the tip modal do not pull the wallet stack into the entry bundle.
 */
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import type { TipFundingSource, TipFundingStage } from '@/lib/tip-funding';

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
): Promise<boolean> {
  const vars = { symbol: source.symbol, chain: CHAIN_NAMES[source.chainId] ?? '' };
  const label: Record<TipFundingStage, string> = {
    quote: t('tip.payQuoting', 'Getting the best price…'),
    approve: t('tip.stageApprove', 'Approving {{symbol}}…', vars),
    bridge: t('tip.stageBridge', 'Sending {{symbol}} from {{chain}}…', vars),
    arriving: t('tip.stageArriving', 'Arriving on Base, usually a few seconds…'),
    swap: t('tip.stageSwap', 'Buying DHB on Uniswap…'),
  };
  try {
    const { fundTip } = await import('@/lib/tip-funding');
    await fundTip({
      source,
      amountDhb,
      walletAddress,
      onStage: stage => toast.loading(label[stage], { id: 'tip-payment' }),
    });
    return true;
  } catch (error) {
    const aa = await import('@/lib/contracts/aa-utils').catch(() => null);
    if (aa?.isWalletLockedError(error)) {
      toast.dismiss('tip-payment');
      return false;
    }
    const message = error instanceof Error ? error.message : '';
    toast.error(message || t('tip.payFailed', 'Could not convert {{symbol}} to DHB', vars), { id: 'tip-payment', duration: 8000 });
    return false;
  }
}
