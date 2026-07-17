/**
 * DeHub Payment Router (#45)
 * ==========================
 * Single-tx: native ETH → DHB swap + sendFundsForPPV + optional sendTip
 */

import { Interface } from 'ethers';
import { writeContractAA, switchChain } from './aa-utils';
import { toWei, getChainConfig, BASE_CHAIN_ID } from './dhb-token';
import { getSwapQuote, applySlippage } from './uniswap-swap';
import type { ChainId } from '@/components/app/ChainSelector';

const routerInterface = new Interface([
  'function unlockPPVAndTip(uint256 tokenId, uint256 ppvAmount, uint256 tipAmount, address creator, uint256 minDhbOut) external payable',
]);

export interface UnlockPPVAndTipParams {
  routerAddress: string;
  tokenId: string | number;
  ppvAmount: number;
  tipAmount: number;
  creator: string;
  chainId?: ChainId;
}

/**
 * Pay with native ETH: router swaps to DHB and calls StreamController atomically.
 */
export async function unlockPPVAndTipViaRouter(
  params: UnlockPPVAndTipParams,
): Promise<{ hash: string }> {
  const chainId = params.chainId || BASE_CHAIN_ID;
  await switchChain(chainId);

  const ppvWei = toWei(params.ppvAmount, 18);
  const tipWei = toWei(params.tipAmount, 18);
  const totalWei = ppvWei + tipWei;

  if (totalWei <= BigInt(0)) {
    throw new Error('PPV and tip amounts cannot both be zero');
  }

  const quote = await getSwapQuote(totalWei);
  if (!quote) {
    throw new Error('Could not get swap quote for payment router');
  }

  const maxEthIn = applySlippage(quote.amountIn);
  const minDhbOut = totalWei;

  const result = await writeContractAA(
    params.routerAddress,
    routerInterface,
    'unlockPPVAndTip',
    [BigInt(params.tokenId), ppvWei, tipWei, params.creator, minDhbOut],
    {
      value: maxEthIn,
      context: 'Atomic PPV + tip payment',
      chainId,
    },
  );

  const receipt = await result.wait(1);
  return { hash: receipt.hash };
}

export function isPaymentRouterAvailable(
  chainId: ChainId,
  paymentRouter?: string | null,
): boolean {
  if (!paymentRouter) return false;
  try {
    getChainConfig(chainId);
    return paymentRouter.startsWith('0x') && paymentRouter.length === 42;
  } catch {
    return false;
  }
}
