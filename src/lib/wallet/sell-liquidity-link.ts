import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';

const USDC: Record<number, string> = {
  [BASE_CHAIN_ID]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [BNB_CHAIN_ID]: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
};

export function sellLiquidityLink(chainId: typeof BASE_CHAIN_ID | typeof BNB_CHAIN_ID): string {
  const params = new URLSearchParams({
    chain: chainId === BASE_CHAIN_ID ? 'base' : 'bnb',
    currencyA: CHAIN_CONFIGS[chainId].dhbToken,
    currencyB: USDC[chainId],
    fee: JSON.stringify({ feeAmount: 3000, tickSpacing: 60, isDynamic: false }),
    priceRangeState: JSON.stringify({
      // Base sorts USDC before DHB, so invert to quote USDC per DHB.
      priceInverted: chainId === BASE_CHAIN_ID,
      fullRange: false,
      minPrice: '0.001',
      maxPrice: '0.0011',
      initialPrice: '0.001',
      inputMode: 'price',
    }),
    depositState: JSON.stringify({ exactField: 'TOKEN0', exactAmounts: {} }),
  });
  return `https://app.uniswap.org/positions/create/v4?${params.toString()}`;
}
