/**
 * Tokens a tip can be paid in directly, with no swap into DHB first.
 *
 * Each one is enabled on that chain's stream controller (read on-chain with
 * getAllTokens), so sendTip moves it from the tipper to the creator and emits
 * the same SendFunds event a DHB tip does — the backend records it, with its
 * own ticker, and notifies the creator. A token missing here would revert
 * with TokenNotEnabled, so nothing is offered that the contract refuses.
 *
 * Decimals are the token's own, also read on-chain: BNB Chain's USDC and USDT
 * are 18, Base's are 6. Getting this wrong sends a millionth or a trillion
 * times the amount, which is why the list is fixed rather than read from a
 * wallet's token metadata.
 */
// Plain ids, no contracts import: this list is read by eager tip surfaces.
const BASE_CHAIN_ID = 8453;
const BNB_CHAIN_ID = 56;

export interface DirectTipToken {
  chainId: number;
  address: string;
  symbol: 'USDC' | 'USDT';
  decimals: number;
}

export const DIRECT_TIP_TOKENS: DirectTipToken[] = [
  { chainId: BASE_CHAIN_ID, address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
  { chainId: BASE_CHAIN_ID, address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT', decimals: 6 },
  { chainId: BNB_CHAIN_ID, address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', decimals: 18 },
  { chainId: BNB_CHAIN_ID, address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
];


/** The direct tip token matching a wallet balance, or null when it has to go through DHB. */
export function directTipToken(source: { chainId: number; address: string } | null | undefined): DirectTipToken | null {
  if (!source) return null;
  return DIRECT_TIP_TOKENS.find(
    tk => tk.chainId === Number(source.chainId) && tk.address.toLowerCase() === source.address.toLowerCase(),
  ) ?? null;
}
