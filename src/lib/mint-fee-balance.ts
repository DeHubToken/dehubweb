import type { ChainId } from '@/components/app/ChainSelector';
import type { MintFeeQuoteResponse } from '@/lib/api/dehub';

/**
 * Can `owner` pay this mint fee?
 *
 * Mints are charged in the chain's own coin (BNB, ETH) by default and in DHB
 * when the server is switched back, so the balance read follows the quote:
 * the native balance for a native fee, the quote's token otherwise. Answers
 * null when the balance could not be read — that must not decide anything.
 */
export async function mintFeeShortfall(
  fee: MintFeeQuoteResponse,
  owner: string,
  chainId: ChainId,
): Promise<boolean | null> {
  try {
    const needed = mintFeeWei(fee);
    let balance: bigint;
    if (fee.isNative) {
      const { getNativeBalance } = await import('@/lib/wallet/tokens');
      balance = await getNativeBalance(owner, chainId);
    } else if (fee.tokenAddress) {
      const { getERC20Balance } = await import('@/lib/contracts/aa-utils');
      balance = await getERC20Balance(fee.tokenAddress, owner, chainId);
    } else {
      const { getDHBBalance } = await import('@/lib/contracts/stream-controller');
      balance = await getDHBBalance(owner, chainId);
    }
    return balance < needed;
  } catch (err) {
    console.warn('[MintFee] Could not read the fee balance:', err);
    return null;
  }
}

/** The quote in base units, at the quote's own decimals. */
export function mintFeeWei(fee: Pick<MintFeeQuoteResponse, 'amount' | 'decimals'>): bigint {
  const decimals = fee.decimals ?? 18;
  // 1e8 keeps a native fee like 0.00002503 BNB exact; 1e6 would round it.
  return (BigInt(Math.ceil(fee.amount * 1e8)) * BigInt(10) ** BigInt(decimals)) / BigInt(1e8);
}

/** Where to go to cover a fee: the wallet for a chain coin, the buy page for DHB. */
export function mintFeeTopUpPath(fee: Pick<MintFeeQuoteResponse, 'isNative'>): string {
  return fee.isNative ? '/app/wallet' : '/app/buy';
}

/** A fee as a price: trailing zeros trimmed, never "2.5e-5". */
export function formatMintFee(amount: number): string {
  if (amount >= 1) return amount.toFixed(2).replace(/\.?0+$/, '');
  return amount.toFixed(8).replace(/\.?0+$/, '');
}
